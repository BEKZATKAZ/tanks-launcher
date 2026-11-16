import { execFile } from "node:child_process";
import { readlink } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import { LauncherError } from "@tanks/core";
import type { Manifest } from "@tanks/core";
import { canonical, safePath } from "./filesystem";
import type { ProcessRecord } from "./models/process-record";

const run = promisify(execFile);

export class ProcessCatalogService {
  async find(root: string, manifest: Manifest): Promise<ProcessRecord[]> {
    try {
      const target = await safePath(root, manifest.executable);
      const expected = await canonical(target).catch(() =>
        process.platform === "win32" ? target.toLowerCase() : target);
      const found: ProcessRecord[] = [];

      for (const item of await this.list()) {
        if (process.platform !== "linux" && basename(item.path).toLowerCase()
          !== basename(target).toLowerCase()) {
          continue;
        }

        let path = item.path;

        if (process.platform === "linux") {
          path = await readlink(`/proc/${item.pid}/exe`).catch(() => "");
        }

        if (process.platform === "darwin") {
          const output = await run("/usr/sbin/lsof", ["-a", "-p",
            String(item.pid), "-d", "txt", "-Fn"])
            .catch(() => ({ stdout: "" }));

          path = output.stdout.split("\n")
            .find(line => line.startsWith("n"))?.slice(1) ?? "";
        }

        if (path && await canonical(path).catch(() => "") === expected) {
          found.push({ ...item, path });
        }
      }

      return found;
    }
    catch {
      throw new LauncherError("process");
    }
  }

  async list(): Promise<ProcessRecord[]> {
    if (process.platform === "win32") {
      const script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
        + "@(Get-CimInstance Win32_Process | Select-Object "
        + "ProcessId,ParentProcessId,ExecutablePath,CreationDate) "
        + "| ConvertTo-Json -Compress";

      const { stdout } = await run("powershell.exe", ["-NoProfile",
        "-NonInteractive", "-Command", script],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 10000 });

      const records = JSON.parse(stdout || "[]") as {
        ProcessId: number; ParentProcessId: number; ExecutablePath?: string;
        CreationDate: string;
      }[];

      return records.map(item => ({ pid: item.ProcessId,
        parent: item.ParentProcessId, path: item.ExecutablePath ?? "",
        identity: item.CreationDate }));
    }

    const { stdout } = await run("ps", ["-axww", "-o", "pid=,ppid=,lstart=,comm="],
      { maxBuffer: 8 * 1024 * 1024, timeout: 10000,
        env: { ...process.env, LC_ALL: "C" } });

    return stdout.split("\n").flatMap(line => {
      const pattern = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.+)$/;
      const match = pattern.exec(line);

      return match
        ? [{ pid: Number(match[1]), parent: Number(match[2]),
            identity: match[3], path: match[4] }]
        : [];
    });
  }
}
