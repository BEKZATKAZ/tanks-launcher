import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { LauncherError } from "@tanks/core";
import type { Manifest, ProcessService } from "@tanks/core";
import { safePath } from "./filesystem";
import type { ProcessRecord } from "./models/process-record";
import { ProcessCatalogService } from "./process-catalog-service";

const run = promisify(execFile);

export class NativeProcessService implements ProcessService {
  private readonly _catalog = new ProcessCatalogService();

  async running(root: string, manifest: Manifest): Promise<boolean> {
    return (await this._catalog.find(root, manifest)).length > 0;
  }

  async play(root: string, manifest: Manifest): Promise<void> {
    try {
      if (await this.running(root, manifest)) {
        return;
      }

      const executable = await safePath(root, manifest.executable);
      const cwd = await safePath(root, manifest.workingDirectory);

      if ((await stat(executable)).isFile() === false) {
        throw new LauncherError("process");
      }

      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, [], {
          cwd, detached: true, stdio: "ignore", windowsHide: true
        });

        child.once("error", reject);
        child.once("spawn", () => {
          child.unref();
          resolve();
        });
      });
    }
    catch {
      throw new LauncherError("process");
    }
  }

  async stop(root: string, manifest: Manifest): Promise<void> {
    try {
      const found = await this._catalog.find(root, manifest);

      for (const processInfo of found) {
        const current = await this._catalog.find(root, manifest);

        if (current.some(item => item.pid === processInfo.pid
          && item.identity === processInfo.identity) === false) {
          continue;
        }

        if (process.platform === "win32") {
          await run("taskkill.exe", ["/PID", String(processInfo.pid),
            "/T", "/F"], { windowsHide: true });

          continue;
        }

        const tree = await this._catalog.list();
        const descendants = this.descendants(tree, processInfo.pid);

        for (const pid of [...descendants.reverse(), processInfo.pid]) {
          try {
            process.kill(pid, "SIGKILL");
          }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
              throw error;
            }
          }
        }
      }
    }
    catch {
      throw new LauncherError("process");
    }
  }

  private descendants(tree: ProcessRecord[], parent: number): number[] {
    const result: number[] = [];
    const parents = [parent];

    while (parents.length > 0) {
      const pid = parents.shift();

      for (const child of tree.filter(item => item.parent === pid)) {
        if (result.includes(child.pid) === false) {
          result.push(child.pid);
          parents.push(child.pid);
        }
      }
    }

    return result;
  }
}
