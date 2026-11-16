import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LauncherError } from "@tanks/core";
import { fixture } from "./helpers/fixture";
import { metadata } from "../src/metadata";
import { TransactionService } from "../src/transaction-service";

describe("installation failures", () => {
  let context: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { context = await fixture(); });
  afterEach(async () => { vi.restoreAllMocks(); await context.close(); });

  it("leaves a committed game playable after insufficient space for an update", async () => {
    context.publish("first", { "game.exe": "original" });
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    context.publish("next", { "game.exe": "replacement" });
    context.setLatest("next");
    vi.spyOn(context.disk, "space").mockRejectedValue(new LauncherError("diskSpace"));
    await service.execute({ type: "install" });
    expect(service.snapshot.installed?.version).toBe("first");
    expect(await readFile(join(context.root, "game.exe"), "utf8")).toBe("original");
    expect(service.snapshot.error).toBe("diskSpace");
    expect(service.snapshot.pending).toBe(true);
  });

  it("keeps metadata and destination after partial uninstall and permits retry", async () => {
    context.publish("first", { "game.exe": "game" });
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    vi.spyOn(context.disk, "uninstall").mockRejectedValueOnce(new LauncherError("files"));
    await service.execute({ type: "uninstall" });
    expect((await context.settings.load()).destination).toBe(context.root);
    expect(service.snapshot.installed).toBeDefined();
    await service.execute({ type: "uninstall" });
    expect(service.snapshot.destination).toBeUndefined();
  });

  it("does not overwrite a user-created file that conflicts with a new release", async () => {
    context.publish("first", { "game.exe": "original" });
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    await writeFile(join(context.root, "added.bin"), "personal data");
    context.publish("next", { "game.exe": "replacement", "added.bin": "publisher data" });
    context.setLatest("next");
    await service.execute({ type: "install" });
    expect(service.snapshot.error).toBe("conflict");
    expect(service.snapshot.installed?.version).toBe("first");
    expect(await readFile(join(context.root, "added.bin"), "utf8")).toBe("personal data");
    expect(await readFile(join(context.root, "game.exe"), "utf8")).toBe("original");
    await service.execute({ type: "uninstall" });
    expect(await readFile(join(context.root, "added.bin"), "utf8")).toBe("personal data");
  });

  it("rolls back replacements if installation metadata cannot be committed", async () => {
    context.publish("first", { "game.exe": "original" });
    const service = context.service();
    await service.initialize();
    await service.execute({ type: "install", destination: context.root });
    const next = context.publish("next", { "game.exe": "replacement" });
    await context.disk.prepare(context.root, { manifest: next, operation: "update" });
    await writeFile(metadata(context.root, "stage/game.exe"), "replacement");
    const transactions = new TransactionService(async () => {
      throw new LauncherError("files");
    });
    await expect(transactions.commit(context.root, next)).rejects.toThrow();
    expect(await readFile(join(context.root, "game.exe"), "utf8")).toBe("original");
    expect((await context.disk.installed(context.root))?.version).toBe("first");
    await service.execute({ type: "resume" });
    expect(service.snapshot.installed?.version).toBe("next");
  });
});
