import { chmod, mkdir, rename, rm, rmdir } from "node:fs/promises";
import { dirname } from "node:path";
import { LauncherError, validRelativePath } from "@tanks/core";
import type { Manifest } from "@tanks/core";
import { atomicJson, exists, readJson, safePath } from "./filesystem";
import { installed, metadata, storedManifest } from "./metadata";
import type { Transaction } from "./models/transaction";
import type { TransactionEntry } from "./models/transaction-entry";

async function clean(root: string): Promise<void> {
  const names = ["rollback", "stage", "downloads", "pending.json", "transaction.json"];

  for (const name of names) {
    await rm(await safePath(root, `.tanks-launcher/${name}`),
      { recursive: true, force: true });
  }
}

export async function pruneParents(root: string, path: string): Promise<void> {
  let parent = dirname(path);

  while (parent !== root && parent.startsWith(root)) {
    try {
      await rmdir(parent);
    }
    catch {
      return;
    }

    parent = dirname(parent);
  }
}

export class TransactionService {
  constructor(private readonly _publish = atomicJson) {}

  async recover(root: string): Promise<void> {
    const journal = await safePath(root, ".tanks-launcher/transaction.json");

    if (await exists(journal) === false) {
      return;
    }

    const transaction = await readJson(journal) as Transaction;

    storedManifest(transaction.target);

    if (transaction.previous !== undefined) {
      storedManifest(transaction.previous);
    }

    if (typeof transaction.committed !== "boolean"
      || Array.isArray(transaction.entries) === false
      || transaction.entries.some(entry => validRelativePath(entry.path) === false
        || typeof entry.original !== "boolean"
        || typeof entry.replace !== "boolean")) {
      throw new LauncherError("files");
    }

    if (transaction.committed) {
      await clean(root);
      return;
    }

    for (const entry of [...transaction.entries].reverse()) {
      const live = await safePath(root, entry.path);
      const backup = await safePath(metadata(root, "rollback"), entry.path);

      if (await exists(backup)) {
        await rm(live, { force: true });
        await mkdir(dirname(live), { recursive: true });
        await rename(backup, live);
      }
      else if (entry.original === false) {
        await rm(live, { force: true });
      }
    }

    if (transaction.previous !== undefined) {
      await atomicJson(metadata(root, "installed.json"), transaction.previous);
    }
    else {
      await rm(metadata(root, "installed.json"), { force: true });
    }

    await rm(metadata(root, "rollback"), { recursive: true, force: true });
    await rm(journal);
  }

  async commit(root: string, manifest: Manifest): Promise<void> {
    const previous = await installed(root);
    const entries: TransactionEntry[] = [];
    const nextPaths = new Set(manifest.files.map(file => file.path));
    const ownedPaths = new Set(previous?.files.map(file => file.path) ?? []);

    for (const file of manifest.files) {
      if (ownedPaths.has(file.path) === false
        && await exists(await safePath(root, file.path))) {
        throw new LauncherError("conflict");
      }
    }

    for (const file of previous?.files ?? []) {
      if (nextPaths.has(file.path) === false) {
        entries.push({ path: file.path,
          original: await exists(await safePath(root, file.path)),
          replace: false });
      }
    }

    for (const file of manifest.files) {
      if (await exists(await safePath(metadata(root, "stage"), file.path))) {
        entries.push({ path: file.path,
          original: await exists(await safePath(root, file.path)),
          replace: true });
      }
    }

    const transaction: Transaction = {
      committed: false, previous, target: manifest, entries
    };
    const journal = metadata(root, "transaction.json");

    await atomicJson(journal, transaction);

    try {
      for (const entry of entries) {
        const live = await safePath(root, entry.path);
        const backup = await safePath(metadata(root, "rollback"), entry.path);

        if (entry.original) {
          await mkdir(dirname(backup), { recursive: true });
          await rename(live, backup);
          await pruneParents(root, live);
        }

        if (entry.replace) {
          await mkdir(dirname(live), { recursive: true });
          await rename(await safePath(metadata(root, "stage"), entry.path), live);
        }
      }

      if (process.platform !== "win32") {
        for (const file of manifest.files) {
          await chmod(await safePath(root, file.path),
            file.path === manifest.executable ? 0o755 : 0o644);
        }
      }

      await this._publish(metadata(root, "installed.json"), manifest);
      await atomicJson(journal, { ...transaction, committed: true });
    }
    catch (error) {
      await this.recover(root);
      throw error;
    }

    await clean(root);
  }
}
