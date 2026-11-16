import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { validateManifest } from "@tanks/core";
import { fixture } from "./helpers/fixture";

let context: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => { await context?.close(); });

it("generates a manifest accepted by the launcher for actual release files", async () => {
  context = await fixture();
  await mkdir(context.root);
  await writeFile(join(context.root, "game.exe"), "game data");
  const { stdout } = await promisify(execFile)(process.execPath, [
    resolve("scripts/create-manifest.js"), "--directory", context.root,
    "--version", "test", "--platform", "windows", "--architecture", "x64",
    "--executable", "game.exe"
  ], { windowsHide: true });
  const manifest = validateManifest(JSON.parse(stdout), "test", "windows", "x64");
  expect(manifest.files[0].size).toBe(Buffer.byteLength("game data"));
  expect(manifest.files[0]).not.toHaveProperty("executable");
  expect(manifest.executable).toBe("game.exe");
});
