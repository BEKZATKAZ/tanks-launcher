import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OperationControl } from "@tanks/core";
import { atomicJson } from "../src/filesystem";
import { metadata } from "../src/metadata";
import { fixture } from "./helpers/fixture";

describe("installation storage boundaries", () => {
  let context: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { context = await fixture(); });
  afterEach(async () => { await context.close(); });

  it("refuses unrelated directories, user home, and filesystem roots", async () => {
    await mkdir(context.root);
    await writeFile(join(context.root, "unrelated.txt"), "preserve");
    await expect(context.disk.validateDestination(context.root)).rejects.toThrow();
    await expect(context.disk.validateDestination(homedir())).rejects.toThrow();
    await expect(context.disk.validateDestination(parse(context.root).root))
      .rejects.toThrow();
    expect(await readFile(join(context.root, "unrelated.txt"), "utf8")).toBe("preserve");
  });

  it("rejects symlink/junction escapes", async () => {
    await context.disk.validateDestination(context.root);
    const outside = join(context.temporary, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "data"), "outside");
    await symlink(outside, join(context.root, "linked"),
      process.platform === "win32" ? "junction" : "dir");
    const manifest = context.publish("first", { "game.exe": "game", "linked/data": "x" });
    await expect(context.disk.matches(context.root, manifest.files[1],
      new OperationControl())).rejects.toThrow();
    expect(await readFile(join(outside, "data"), "utf8")).toBe("outside");
  });

  it("guards against concurrent operations and recovers a stale process lock", async () => {
    await context.disk.validateDestination(context.root);
    const unlock = await context.disk.lock(context.root);
    await expect(context.disk.lock(context.root)).rejects.toThrow();
    await unlock();
    await mkdir(metadata(context.root, "lock"));
    await atomicJson(metadata(context.root, "lock/owner.json"), {
      pid: 2147483647, token: "stale"
    });
    const recovered = await context.disk.lock(context.root);
    await recovered();
  });

  it("persists settings atomically and reports corrupted settings", async () => {
    await context.settings.save({ language: "fr", destination: context.root });
    expect(await context.settings.load()).toEqual({
      language: "fr", destination: context.root
    });
    await writeFile(join(context.temporary, "settings.json"), "broken JSON");
    await expect(context.settings.load()).rejects.toMatchObject({ code: "settings" });
  });
});
