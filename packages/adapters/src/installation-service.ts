import { randomUUID } from "node:crypto";
import {
  access, mkdir, readdir, realpath, rm, statfs, writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, parse, resolve, sep } from "node:path";
import { LauncherError } from "@tanks/core";
import type {
  InstallationService, Manifest, PendingOperation
} from "@tanks/core";
import { atomicJson, exists, matches, readJson, safePath } from "./filesystem";
import { acquireLock } from "./installation-lock";
import { installed, metadata, pending } from "./metadata";
import { pruneParents, TransactionService } from "./transaction-service";

export class NativeInstallationService implements InstallationService {
  private readonly _transactions = new TransactionService();
  readonly exists = exists;
  readonly installed = installed;
  readonly pending = pending;
  readonly matches = matches;

  stage(root: string): string {
    return metadata(root, "stage");
  }

  async validateDestination(input: string): Promise<string> {
    if (typeof input !== "string" || input.includes("\0")
      || isAbsolute(input) === false) {
      throw new LauncherError("destination");
    }

    const root = resolve(input);
    const forbidden = [process.env.WINDIR,
      process.env.ProgramFiles, process.env["ProgramFiles(x86)"],
      "/usr", "/bin", "/etc", "/var", "/System", "/Applications"]
      .filter((value): value is string => value !== undefined)
      .map(value => resolve(value).toLowerCase());

    const lower = root.toLowerCase();

    if ([parse(root).root, homedir()].map(value => resolve(value).toLowerCase())
      .includes(lower) || forbidden.some(path => lower === path
        || lower.startsWith(`${path}${sep}`))) {
      throw new LauncherError("destination");
    }

    await safePath(root);
    await mkdir(root, { recursive: true });

    const entries = await readdir(root);

    if (entries.length > 0) {
      const marker = await safePath(root, ".tanks-launcher/owner.json");

      if (await exists(marker) === false
        || (await readJson(marker) as { app?: string }).app !== "tanks") {
        throw new LauncherError("destination");
      }
    }

    await access(root);

    const probe = join(root, `.tanks-launcher-probe-${randomUUID()}`);

    await writeFile(probe, "", { flag: "wx" });
    await rm(probe);

    await mkdir(metadata(root), { recursive: true });
    await atomicJson(metadata(root, "owner.json"), { app: "tanks" });

    return realpath(root);
  }

  async lock(root: string): Promise<() => Promise<void>> {
    await safePath(root, ".tanks-launcher/lock");

    return acquireLock(metadata(root, "lock"));
  }

  async prepare(root: string, operation: PendingOperation): Promise<void> {
    const old = await pending(root);

    if (old !== undefined && JSON.stringify(old) !== JSON.stringify(operation)) {
      throw new LauncherError("busy");
    }

    await mkdir(await safePath(root, ".tanks-launcher/stage"),
      { recursive: true });

    await atomicJson(metadata(root, "pending.json"), operation);
  }

  async space(root: string, bytes: number): Promise<void> {
    const info = await statfs(root);

    if (info.bavail * info.bsize < bytes) {
      throw new LauncherError("diskSpace");
    }
  }

  async recover(root: string): Promise<void> {
    await this._transactions.recover(root);
  }

  async commit(root: string, manifest: Manifest): Promise<void> {
    await this._transactions.commit(root, manifest);
  }

  async uninstall(root: string): Promise<void> {
    const manifest = await installed(root);

    if (manifest !== undefined) {
      await atomicJson(metadata(root, "pending.json"), {
        manifest, operation: "verify"
      });
    }

    const files = new Set(manifest?.files.map(file => file.path) ?? []);

    for (const file of files) {
      const path = await safePath(root, file);

      await rm(path, { force: true });
      await pruneParents(root, path);
    }

    for (const name of ["stage", "downloads", "rollback", "transaction.json"]) {
      await rm(await safePath(root, `.tanks-launcher/${name}`),
        { recursive: true, force: true });
    }
  }

  async completeUninstall(root: string): Promise<void> {
    for (const name of ["installed.json", "pending.json"]) {
      await rm(await safePath(root, `.tanks-launcher/${name}`), { force: true });
    }
  }
}
