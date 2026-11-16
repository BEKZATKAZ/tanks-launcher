import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Manifest } from "@tanks/core";
import { NativeProcessService } from "../src";
import { fixture } from "./helpers/fixture";

describe("native process identity", () => {
  let context: Awaited<ReturnType<typeof fixture>>;
  const children: ReturnType<typeof spawn>[] = [];

  beforeEach(async () => { context = await fixture(); });
  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
    }

    await context.close();
  });

  it("detects an external executable and stops only its installation", async () => {
    const executable = process.platform === "win32" ? "test-game.exe" : "test-game";
    const unrelated = join(context.temporary, "unrelated");
    await mkdir(context.root);
    await mkdir(unrelated);
    await copyFile(process.execPath, join(context.root, executable));
    await copyFile(process.execPath, join(unrelated, executable));
    const launch = async (root: string) => {
      const child = spawn(join(root, executable), ["-e", "setInterval(() => {}, 1000)"],
        { stdio: "ignore", windowsHide: true });
      children.push(child);
      await once(child, "spawn");
      return child;
    };
    const game = await launch(context.root);
    const other = await launch(unrelated);
    const manifest: Manifest = {
      schemaVersion: 1, version: "test", executable, workingDirectory: ".",
      platform: "windows", architecture: "x64", files: []
    };
    const service = new NativeProcessService();
    expect(await service.running(context.root, manifest)).toBe(true);
    const exited = once(game, "exit");
    await service.stop(context.root, manifest);
    await exited;
    expect(await service.running(context.root, manifest)).toBe(false);
    expect(other.exitCode).toBeNull();
    expect(other.signalCode).toBeNull();
  }, 30000);

  it("reports an unavailable executable as a launch failure", async () => {
    const manifest = context.publish("first", { "game.exe": "missing" });
    await expect(new NativeProcessService().play(context.root, manifest))
      .rejects.toMatchObject({ code: "process" });
  });
});
