import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat, mkdir, open, readFile, realpath, rename, rm, stat
} from "node:fs/promises";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { LauncherError } from "@tanks/core";
import type { OperationControl, ReleaseFile } from "@tanks/core";

export async function safePath(root: string, path = "."): Promise<string> {
  const base = resolve(root);
  const target = resolve(base, path);
  const rel = relative(base, target);

  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new LauncherError("destination");
  }

  const parsed = parse(target);
  let current = parsed.root;

  for (const part of target.slice(parsed.root.length).split(sep)) {
    current = resolve(current, part);

    try {
      const info = await lstat(current);

      if (info.isSymbolicLink()) {
        throw new LauncherError("destination");
      }
    }
    catch (error) {
      if (isMissing(error) === false) {
        throw error;
      }
    }
  }

  return target;
}

export function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  }
  catch (error) {
    if (isMissing(error)) {
      return false;
    }

    throw error;
  }
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function atomicJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    const handle = await open(temporary, "wx", 0o600);

    try {
      await handle.writeFile(JSON.stringify(data));
      await handle.sync();
    }
    finally {
      await handle.close();
    }

    await rename(temporary, path);
  }
  finally {
    await rm(temporary, { force: true });
  }
}

export async function matches(
  root: string,
  file: ReleaseFile,
  control: OperationControl,
  progress?: (bytes: number) => void
): Promise<boolean> {
  const target = await safePath(root, file.path);

  try {
    const info = await stat(target);

    if (info.isFile() === false || info.size !== file.size) {
      return false;
    }

    const hash = createHash("sha256");
    const stream = createReadStream(target);

    for await (const chunk of stream) {
      control.check();
      hash.update(chunk);
      progress?.(chunk.length);
    }

    return hash.digest("hex") === file.sha256;
  }
  catch (error) {
    if (isMissing(error)) {
      return false;
    }

    throw error;
  }
}

export async function canonical(path: string): Promise<string> {
  const value = await realpath(path);

  return process.platform === "win32" ? value.toLowerCase() : value;
}
