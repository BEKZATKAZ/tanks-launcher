import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixture";

describe("installation lifecycle", () => {
  let context: Awaited<ReturnType<typeof fixture>>;

  beforeEach(async () => { context = await fixture(); });
  afterEach(async () => { await context.close(); });

  it("installs, updates only changes, repairs, and preserves user files on uninstall", async () => {
    const first = context.publish("first", {
      "game.exe": "original game", "unchanged.bin": "shared", "removed.bin": "obsolete"
    });
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    expect(service.snapshot.releaseOperation).toEqual({ id: service.snapshot.operationId, version: first.version });
    expect(service.snapshot.installed?.version).toBe(first.version);
    expect(service.snapshot.error).toBeUndefined();
    expect((await context.settings.load()).destination).toBe(context.root);
    await writeFile(join(context.root, "personal.txt"), "keep me");

    const next = context.publish("next", {
      "game.exe": "updated game", "unchanged.bin": "shared", "added.bin": "new"
    });
    context.setLatest(next.version);
    const before = context.requests.length;
    await service.execute({ type: "install" });
    const requests = context.requests.slice(before).map(item => item.path);
    expect(service.snapshot.releaseOperation).toEqual({ id: service.snapshot.operationId, version: next.version });
    expect(service.snapshot.installed?.version).toBe(next.version);
    expect(requests.some(path => path.endsWith("/unchanged.bin"))).toBe(false);
    expect(requests.some(path => path.endsWith("/added.bin"))).toBe(true);
    await expect(readFile(join(context.root, "removed.bin"))).rejects.toThrow();

    await writeFile(join(context.root, "game.exe"), "corruption");
    const repairStart = context.requests.length;
    await service.execute({ type: "verify" });
    expect(service.snapshot.releaseOperation).toBeUndefined();
    expect(await readFile(join(context.root, "game.exe"), "utf8")).toBe("updated game");
    expect(context.requests.slice(repairStart).map(item => item.path))
      .toEqual([`/${next.version}/windows-x64/game.exe`]);

    await service.execute({ type: "language", language: "fr" });
    await service.execute({ type: "uninstall" });
    expect(await readFile(join(context.root, "personal.txt"), "utf8")).toBe("keep me");
    expect(await context.settings.load()).toEqual({ language: "fr" });
    expect(service.snapshot.installed).toBeUndefined();
  });

  it("detects externally running games and prevents mutation until Stop", async () => {
    context.publish("first", { "game.exe": "game" });
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    await context.processes.play(context.root, context.releases.get("first")!.manifest);
    await service.poll();
    expect(service.snapshot.running).toBe(true);
    await service.execute({ type: "uninstall" });
    expect(service.snapshot.error).toBe("busy");
    expect(service.snapshot.installed).toBeDefined();
    await service.execute({ type: "stop" });
    expect(service.snapshot.running).toBe(false);
    await service.execute({ type: "play" });
    expect(service.snapshot.running).toBe(true);
  });

  it("loads an installed game offline and detects a changed version pointer at click", async () => {
    context.publish("first", { "game.exe": "game" });
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    context.offline(true);
    const offline = context.service();
    await offline.initialize();
    expect(offline.snapshot.installed?.version).toBe("first");
    expect(offline.snapshot.error).toBe("network");
    await offline.execute({ type: "play" });
    expect(offline.snapshot.running).toBe(true);
    await offline.execute({ type: "stop" });
    context.offline(false);
    context.publish("next", { "game.exe": "new" });
    context.setLatest("next");
    await offline.execute({ type: "install" });
    expect(offline.snapshot.installed?.version).toBe("next");
  });

  it("reports unavailable platform builds without installing", async () => {
    context.setLatest("unpublished");
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    expect(service.snapshot.error).toBe("unsupported");
    expect(service.snapshot.installed).toBeUndefined();
  });

  it("allows selecting a new folder when the saved destination is missing", async () => {
    context.publish("first", { "game.exe": "game" });
    const service = context.service();

    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    await rename(context.root, join(context.temporary, "moved-game"));

    const reopened = context.service();
    const destination = join(context.temporary, "chosen-game");

    await reopened.initialize();
    expect(reopened.snapshot.missingDestination).toBe(true);

    await reopened.execute({ type: "install", destination });

    expect(reopened.snapshot.installed?.version).toBe("first");
    expect((await context.settings.load()).destination).toBe(destination);
  });
});
