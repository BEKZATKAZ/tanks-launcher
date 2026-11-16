import { LauncherError } from "./models";
import type { Architecture, Manifest, Platform } from "./models";

export function validRelativePath(
  value: unknown,
  directory = false
): value is string {
  if (directory && value === ".") {
    return true;
  }

  if (typeof value !== "string" || value.length === 0
    || value.length > 1024 || /[\\<>:"|?*]/.test(value)
    || [...value].some(character => character.charCodeAt(0) < 32)) {
    return false;
  }

  return value.split("/").every(part => part.length > 0 && part !== "."
    && part !== ".." && /[. ]$/.test(part) === false
    && /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part) === false
    && part.toLowerCase().startsWith(".tanks-launcher") === false);
}

export function validateVersion(value: unknown): string {
  if (typeof value !== "string"
    || /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value) === false
    || value.includes("..")) {
    throw new LauncherError("manifest");
  }

  return value;
}

export function validateManifest(
  value: unknown,
  version: string,
  platform: Platform,
  architecture: Architecture
): Manifest {
  if (value === null || typeof value !== "object") {
    throw new LauncherError("manifest");
  }

  const data = value as Manifest;

  if (data.schemaVersion !== 1 || data.version !== validateVersion(version)
    || data.platform !== platform || data.architecture !== architecture
    || validRelativePath(data.executable) === false
    || validRelativePath(data.workingDirectory, true) === false
    || Array.isArray(data.files) === false || data.files.length === 0) {
    throw new LauncherError("manifest");
  }

  const paths = new Set<string>();
  let total = 0;

  for (const file of data.files) {
    if (file === null || typeof file !== "object"
      || validRelativePath(file.path) === false
      || Number.isSafeInteger(file.size) === false || file.size < 0
      || typeof file.sha256 !== "string"
      || /^[a-f0-9]{64}$/.test(file.sha256) === false
      || paths.has(file.path.toLowerCase())) {
      throw new LauncherError("manifest");
    }

    total += file.size;
    paths.add(file.path.toLowerCase());
  }

  for (const path of paths) {
    const parts = path.split("/");
    parts.pop();

    while (parts.length > 0) {
      if (paths.has(parts.join("/"))) {
        throw new LauncherError("manifest");
      }

      parts.pop();
    }
  }

  if (Number.isSafeInteger(total) === false
    || data.files.some(file => file.path === data.executable) === false
    || (data.workingDirectory !== "."
      && data.files.some(file => file.path.startsWith(
        `${data.workingDirectory}/`)) === false)) {
    throw new LauncherError("manifest");
  }

  return data;
}
