import { describe, expect, it, vi } from "vitest";
import { OperationControl, TransferService } from "../src";
import type { InstallationService, Manifest, ReleaseService } from "../src";

describe("transfer scheduling", () => {
  it("bounds downloads and reports progress from configured sizes", async () => {
    const staged = new Set<string>();
    const files = ["a", "b", "c", "d"].map((path, index) => ({
      path, size: (index + 1) * 7, sha256: "a".repeat(64)
    }));
    const manifest: Manifest = {
      schemaVersion: 1, version: "test", platform: "windows", architecture: "x64",
      executable: "a", workingDirectory: ".", files
    };
    let active = 0;
    let peak = 0;
    const started: string[] = [];
    const concurrency = 2;
    const disk: InstallationService = {
      exists: async () => true, validateDestination: async root => root,
      lock: async () => async () => {}, installed: async () => undefined,
      pending: async () => undefined, prepare: async () => {},
      matches: async (root, file) => root === "stage" && staged.has(file.path),
      stage: () => "stage", space: async () => {}, recover: async () => {},
      commit: async () => {}, uninstall: async () => {},
      completeUninstall: async () => {}
    };
    const remote: ReleaseService = {
      platform: "windows", architecture: "x64", latest: async () => "test",
      manifest: async () => manifest,
      download: async (_manifest, file, _target, _control, progress) => {
        started.push(file.path);
        peak = Math.max(peak, ++active);
        progress(file.size / 2);

        await Promise.resolve();

        staged.add(file.path);
        progress(file.size);
        active--;
      }
    };
    const report = vi.fn();

    const clock = { now: () => 0, every: () => () => {} };

    await new TransferService(disk, remote, clock, concurrency).run("root",
      { operation: "install", manifest }, new OperationControl(), report);

    expect(peak).toBe(Math.min(concurrency, files.length));
    expect(started[0]).toBe(files.at(-1)!.path);
    expect(staged).toEqual(new Set(files.map(file => file.path)));
    expect(report).toHaveBeenCalledWith("installing", 1, expect.any(Object));
    expect(report).toHaveBeenLastCalledWith("verifying", 1);

    for (const [, progress] of report.mock.calls) {
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });
});
