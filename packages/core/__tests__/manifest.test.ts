import { describe, expect, it } from "vitest";
import { parseCommand, validateManifest } from "../src";
import type { Architecture, Manifest, Platform } from "../src";

function manifest(platform: Platform = "windows",
  architecture: Architecture = "x64"): Manifest {
  return {
    schemaVersion: 1, version: "test-release", platform, architecture,
    executable: "game", workingDirectory: ".",
    files: [{ path: "game", size: 0, sha256: "a".repeat(64), executable: true }]
  };
}

describe("release contract", () => {
  for (const platform of ["windows", "macos", "linux"] as const) {
    for (const architecture of ["x64", "arm64"] as const) {
      it(`accepts ${platform}-${architecture}`, () => {
        const release = manifest(platform, architecture);
        expect(validateManifest(release, release.version, platform, architecture))
          .toEqual(release);
      });
    }
  }

  it.each(["../escape", "/absolute", "C:/absolute", "a\\b", "a/../b",
    "CON.txt", "a.", "a/", ".tanks-launcher/installed.json", "bad\0name"])(
    "rejects unsafe path %s", path => {
      const release = manifest();
      release.files[0].path = path;
      expect(() => validateManifest(release, release.version, "windows", "x64"))
        .toThrow();
    });

  it("rejects conflicting paths, wrong targets, and invalid hashes", () => {
    const original = manifest();
    const invalid: Manifest[] = [
      { ...original, schemaVersion: 2 } as unknown as Manifest,
      { ...original, version: "another" },
      { ...original, platform: "linux" },
      { ...original, architecture: "arm64" },
      { ...original, executable: "missing" },
      { ...original, workingDirectory: "missing-directory" },
      { ...original, files: [{ ...original.files[0], size: -1 }] },
      { ...original, files: [{ ...original.files[0], size: Number.MAX_VALUE }] },
      { ...original, files: [{ ...original.files[0], sha256: "invalid" }] },
      { ...original, files: [...original.files,
        { ...original.files[0], path: "GAME" }] },
      { ...original, files: [...original.files,
        { ...original.files[0], path: "game/child" }] }
    ];

    for (const release of invalid) {
      expect(() => validateManifest(release, original.version, "windows", "x64"))
        .toThrow();
    }
  });
});

describe("command boundary", () => {
  it.each([null, {}, { type: "exec" }, { type: "language", language: "de" },
    { type: "install", destination: 12 }])("rejects malformed command %j", input => {
    expect(() => parseCommand(input)).toThrow();
  });

  it("strips untrusted fields from accepted commands", () => {
    expect(parseCommand({ type: "uninstall", destination: "/arbitrary" }))
      .toEqual({ type: "uninstall" });
  });
});
