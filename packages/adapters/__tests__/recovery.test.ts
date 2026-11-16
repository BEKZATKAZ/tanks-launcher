import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicJson } from "../src/filesystem";
import { metadata } from "../src/metadata";
import { fixture } from "./helpers/fixture";

describe("operation recovery", () => {
  let context: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { context = await fixture(); });
  afterEach(async () => { await context.close(); });

  it.each([false, true])("resumes a pinned release after restart (Range ignored: %s)", async ignoreRange => {
    context.publish("first", { "game.exe": Buffer.alloc(256 * 1024, 5) });
    context.slow(true);
    context.ignoreRange(ignoreRange);
    const service = context.service();
    await service.initialize();
    let paused = false;
    service.state.listeners.add(state => {
      if (state.phase === "installing" && (state.progress ?? 0) > 0 && paused === false) {
        paused = true;
        void service.execute({ type: "pause" });
      }
    });
    await service.execute({ type: "install", destination: context.root });
    expect(service.snapshot.pending).toBe(true);
    expect(service.snapshot.paused).toBe(true);
    expect(service.snapshot.installed).toBeUndefined();
    expect(service.snapshot.totalBytes)
      .toBe(context.releases.get("first")!.files["game.exe"].length);

    context.publish("next", { "game.exe": "future" });
    context.setLatest("next");
    const recovered = context.service();
    await recovered.initialize();
    expect(recovered.snapshot.targetVersion).toBe("first");
    await recovered.execute({ type: "resume" });
    expect(recovered.snapshot.error).toBeUndefined();
    expect(recovered.snapshot.installed?.version).toBe("first");
    expect(context.requests.some(request => request.range !== undefined)).toBe(true);
    expect(await readFile(join(context.root, "game.exe")))
      .toEqual(context.releases.get("first")!.files["game.exe"]);
  });

  it("pauses verification and changes language without losing the saved destination", async () => {
    context.publish("first", { "game.exe": Buffer.alloc(128 * 1024, 3) });
    const service = context.service();
    await service.initialize();
    let paused = false;
    service.state.listeners.add(state => {
      if (state.phase === "verifying" && paused === false) {
        paused = true;
        void service.execute({ type: "pause" });
        void service.execute({ type: "language", language: "ru" });
      }
    });
    await service.execute({ type: "install", destination: context.root });
    expect(service.snapshot.paused).toBe(true);
    await service.execute({ type: "resume" });
    expect(service.snapshot.installed?.version).toBe("first");
    expect(await context.settings.load()).toEqual({
      language: "ru", destination: context.root
    });
  });

  it("rejects corrupt downloads and retries without publishing partial installation", async () => {
    context.publish("first", { "game.exe": "trusted bytes" });
    context.broken(true);
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    expect(service.snapshot.error).toBe("integrity");
    expect(service.snapshot.installed).toBeUndefined();
    context.broken(false);
    await service.execute({ type: "resume" });
    expect(service.snapshot.installed?.version).toBe("first");
  });

  it("retries transient failures and commits zero-byte files", async () => {
    context.publish("first", { "game.exe": "game", "empty.bin": "" });
    context.failRequests(1);
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    expect(service.snapshot.error).toBeUndefined();
    expect(service.snapshot.installed?.version).toBe("first");
    expect((await readFile(join(context.root, "empty.bin"))).length).toBe(0);
    expect(context.requests.filter(item => item.path.endsWith(".bin")
      || item.path.endsWith(".exe")).length).toBeGreaterThan(
      context.releases.get("first")!.manifest.files.length);
  });

  it("rolls back an interrupted commit before Play and retains pending work", async () => {
    const previous = context.publish("first", { "game.exe": "original" });
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    const target = context.publish("next", { "game.exe": "replacement" });
    await context.disk.prepare(context.root, { operation: "update", manifest: target });
    await mkdir(metadata(context.root, "rollback"), { recursive: true });
    await atomicJson(metadata(context.root, "transaction.json"), {
      committed: false, previous, target,
      entries: [{ path: "game.exe", original: true, replace: true }]
    });
    await rename(join(context.root, "game.exe"),
      metadata(context.root, "rollback/game.exe"));
    await writeFile(join(context.root, "game.exe"), "replacement");
    // Metadata can have been published just before a crash as well.
    await atomicJson(metadata(context.root, "installed.json"), target);
    const recovered = context.service();
    await recovered.initialize();
    expect(recovered.snapshot.installed?.version).toBe(previous.version);
    expect(recovered.snapshot.pending).toBe(true);
    expect(await readFile(join(context.root, "game.exe"), "utf8")).toBe("original");
  });

  it("can uninstall a paused first installation", async () => {
    context.publish("first", { "game.exe": "game" });
    const service = context.service();
    await service.initialize();
    service.state.listeners.add(state => {
      if (state.phase === "verifying") {
        void service.execute({ type: "pause" });
      }
    });
    await service.execute({ type: "install", destination: context.root });
    expect(service.snapshot.pending).toBe(true);
    await service.execute({ type: "uninstall" });
    expect(service.snapshot.destination).toBeUndefined();
    expect((await context.settings.load()).destination).toBeUndefined();
  });
});
