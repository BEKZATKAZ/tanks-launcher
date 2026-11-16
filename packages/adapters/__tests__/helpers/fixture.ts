import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { LauncherService } from "@tanks/core";
import type { Manifest, ProcessService } from "@tanks/core";
import {
  NativeClockService, NativeInstallationService, NativeReleaseService, NativeSettingsService
} from "../../src";

export async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), "tanks-launcher-test-"));
  const root = join(temporary, "game");
  const releases = new Map<string, { manifest: Manifest, files: Record<string, Buffer> }>();
  const requests: { path: string, range?: string }[] = [];
  let latest = "first";
  let offline = false;
  let slow = false;
  let ignoreRange = false;
  let broken = false;
  let failures = 0;
  let running = false;

  function publish(version: string, contents: Record<string, string | Buffer>) {
    const files = Object.fromEntries(Object.entries(contents)
      .map(([path, content]) => [path, Buffer.from(content)]));
    const manifest: Manifest = {
      schemaVersion: 1, version, platform: "windows", architecture: "x64",
      executable: "game.exe", workingDirectory: ".",
      files: Object.entries(files).map(([path, content]) => ({
        path, size: content.length, sha256: createHash("sha256")
          .update(content).digest("hex")
      }))
    };
    releases.set(version, { manifest, files });
    return manifest;
  }

  async function serve(response: ServerResponse, body: Buffer) {
    if (slow === false) {
      response.end(body);
      return;
    }

    for (let offset = 0; offset < body.length; offset += 4096) {
      if (response.destroyed) {
        return;
      }

      response.write(body.subarray(offset, offset + 4096));
      await delay(3);
    }

    response.end();
  }

  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url ?? "");
    requests.push({ path, range: request.headers.range });

    if (offline) {
      response.writeHead(503).end();
      return;
    }

    if (path === "/latest-version.txt") {
      response.end(` ${latest}\n`);
      return;
    }

    const [, version, platform, ...parts] = path.split("/");
    const release = releases.get(version);
    const file = parts.join("/");

    if (release === undefined || platform !== "windows-x64") {
      response.writeHead(404).end();
      return;
    }

    if (file === "manifest.json") {
      response.end(JSON.stringify(release.manifest));
      return;
    }

    const body = release.files[file];

    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }

    if (failures > 0) {
      failures--;
      response.writeHead(503).end();
      return;
    }

    const offset = ignoreRange ? 0 : Number(request.headers.range?.match(/\d+/)?.[0] ?? 0);
    response.setHeader("etag", `"${release.manifest.files.find(item =>
      item.path === file)?.sha256}"`);

    if (offset > 0) {
      response.writeHead(206, {
        "content-range": `bytes ${offset}-${body.length - 1}/${body.length}`
      });
    }

    void serve(response, broken ? Buffer.alloc(body.length, 1) : body.subarray(offset));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const disk = new NativeInstallationService();
  const settings = new NativeSettingsService(join(temporary, "settings.json"));
  const remote = new NativeReleaseService("windows", "x64", base);
  const processes: ProcessService = {
    running: async () => running,
    play: async () => { running = true; },
    stop: async () => { running = false; }
  };
  const service = () => new LauncherService(settings, disk, remote, processes,
    new NativeClockService());

  return {
    root, temporary, disk, settings, remote, processes, service, publish, requests,
    releases, setLatest: (value: string) => { latest = value; },
    offline: (value: boolean) => { offline = value; },
    slow: (value: boolean) => { slow = value; },
    ignoreRange: (value: boolean) => { ignoreRange = value; },
    broken: (value: boolean) => { broken = value; },
    failRequests: (value: number) => { failures = value; },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error =>
        error ? reject(error) : resolve()));

      if (dirname(resolve(temporary)) !== resolve(tmpdir())) {
        throw new Error("Unexpected temporary path");
      }

      await rm(temporary, { recursive: true, force: true });
    }
  };
}
