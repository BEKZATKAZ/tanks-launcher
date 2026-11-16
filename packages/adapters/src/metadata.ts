import { join } from "node:path";
import { LauncherError, validateManifest } from "@tanks/core";
import type { Manifest, PendingOperation } from "@tanks/core";
import { exists, readJson, safePath } from "./filesystem";

export function metadata(root: string, name = ""): string {
  return join(root, ".tanks-launcher", name);
}

export function storedManifest(value: unknown): Manifest {
  const manifest = value as Manifest;

  if (manifest === null || typeof manifest !== "object"
    || ["windows", "macos", "linux"].includes(manifest.platform) === false
    || ["x64", "arm64"].includes(manifest.architecture) === false) {
    throw new LauncherError("manifest");
  }

  return validateManifest(manifest, manifest.version,
    manifest.platform, manifest.architecture);
}

export async function installed(root: string): Promise<Manifest | undefined> {
  const path = await safePath(root, ".tanks-launcher/installed.json");

  if (await exists(path) === false) {
    return undefined;
  }

  return storedManifest(await readJson(path));
}

export async function pending(root: string): Promise<PendingOperation | undefined> {
  const path = await safePath(root, ".tanks-launcher/pending.json");

  if (await exists(path) === false) {
    return undefined;
  }

  const value = await readJson(path) as PendingOperation;

  if (value === null || typeof value !== "object"
    || ["install", "update", "verify"].includes(value.operation) === false) {
    throw new LauncherError("manifest");
  }

  return { manifest: storedManifest(value.manifest), operation: value.operation };
}
