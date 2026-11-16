import { createHash } from "node:crypto";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { LauncherError } from "@tanks/core";
import type { OperationControl, ReleaseFile } from "@tanks/core";
import { atomicJson, exists, matches, readJson, safePath } from "./filesystem";

export class DownloadService {
  async download(
    url: string,
    file: ReleaseFile,
    stage: string,
    control: OperationControl,
    progress: (bytes: number, received?: number) => void
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      control.check();

      try {
        await this.transfer(url, file, stage, control, progress);

        return;
      }
      catch (error) {
        control.check();

        if (attempt >= 2 || (error instanceof LauncherError
          && error.code !== "network")) {
          throw error;
        }

        await delay(250 * 2 ** attempt);
      }
    }
  }

  private async transfer(
    url: string,
    file: ReleaseFile,
    stage: string,
    control: OperationControl,
    progress: (bytes: number, received?: number) => void
  ): Promise<void> {
    const key = createHash("sha256").update(file.path).digest("hex");
    const downloads = await safePath(dirname(stage), "downloads");

    await mkdir(downloads, { recursive: true });

    const partial = await safePath(downloads, `${key}.part`);
    const journal = await safePath(downloads, `${key}.json`);
    const target = await safePath(stage, file.path);
    let offset = await exists(partial) ? (await stat(partial)).size : 0;
    let validator: string | undefined;

    if (offset === file.size && await matches(downloads,
      { ...file, path: `${key}.part` }, control)) {
      await mkdir(dirname(target), { recursive: true });
      await rename(partial, target);

      progress(file.size);

      return;
    }

    if (await exists(journal)) {
      const saved = await readJson(journal).catch(() => ({})) as {
        url?: string; hash?: string; validator?: string;
      };

      if (saved.url === url && saved.hash === file.sha256) {
        validator = saved.validator;
      }
    }

    if (validator === undefined || offset > file.size) {
      offset = 0;
    }

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 60000);
    const unsubscribe = control.onPause(() => abort.abort());
    const headers: Record<string, string> = { "Accept-Encoding": "identity" };

    if (offset > 0 && validator !== undefined) {
      headers.Range = `bytes=${offset}-`;
      headers["If-Range"] = validator;
    }

    try {
      const response = await fetch(url, {
        headers, signal: abort.signal, cache: "no-store"
      });

      const etag = response.headers.get("etag");
      const nextValidator = etag && etag.startsWith("W/") === false
        ? etag
        : response.headers.get("last-modified") ?? undefined;

      if (response.status === 206) {
        const range = response.headers.get("content-range");

        if (offset === 0 || nextValidator !== validator
          || range !== `bytes ${offset}-${file.size - 1}/${file.size}`) {
          await response.body?.cancel();
          await rm(journal, { force: true });

          throw new LauncherError("network");
        }
      }
      else if (response.status === 200) {
        offset = 0;
      }
      else {
        await response.body?.cancel();

        throw new LauncherError("network");
      }

      if (response.body === null) {
        throw new LauncherError("network");
      }

      await atomicJson(journal, {
        url, hash: file.sha256, validator: nextValidator
      });

      const handle = await open(partial, offset > 0 ? "a" : "w");

      try {
        progress(offset);

        const reader = response.body.getReader();

        try {
          while (true) {
            const { done, value: chunk } = await reader.read();

            if (done) {
              break;
            }

            control.check();
            timeout.refresh();
            offset += chunk.byteLength;

            if (offset > file.size) {
              throw new LauncherError("integrity");
            }

            await handle.writeFile(chunk);
            progress(offset, chunk.byteLength);
          }
        }
        finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }

        await handle.sync();
      }
      finally {
        await handle.close();
      }

      if (offset < file.size) {
        throw new LauncherError("network");
      }

      if (await matches(downloads, { ...file, path: `${key}.part` }, control)
        === false) {
        await rm(partial, { force: true });
        await rm(journal, { force: true });

        throw new LauncherError("integrity");
      }

      await mkdir(dirname(target), { recursive: true });
      await rename(partial, target);
      await rm(journal, { force: true });
    }
    catch (error) {
      control.check();

      if (error instanceof LauncherError) {
        throw error;
      }

      if ((error as NodeJS.ErrnoException).code === "ENOSPC") {
        throw new LauncherError("diskSpace");
      }

      throw new LauncherError("network");
    }
    finally {
      clearTimeout(timeout);
      unsubscribe();
    }
  }
}
