import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LauncherError } from "@tanks/core";
import { isMissing } from "./filesystem";

export async function acquireLock(path: string): Promise<() => Promise<void>> {
  const token = randomUUID();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir(path);
      await writeFile(join(path, "owner.json"),
        JSON.stringify({ pid: process.pid, token }), { flag: "wx" });

      return async () => {
        const owner = JSON.parse(await readFile(
          join(path, "owner.json"), "utf8"));

        if (owner.token === token) {
          await rm(path, { recursive: true });
        }
      };
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }

    try {
      const owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));

      try {
        process.kill(owner.pid, 0);
        throw new LauncherError("busy");
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          throw new LauncherError("busy");
        }
      }
    }
    catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }

      if (isMissing(error) === false
        || Date.now() - (await stat(path)).mtimeMs < 10000) {
        throw new LauncherError("busy");
      }
    }

    await rm(path, { recursive: true });
  }

  throw new LauncherError("busy");
}
