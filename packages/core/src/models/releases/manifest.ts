import type { Architecture } from "./architecture";
import type { Platform } from "./platform";
import type { ReleaseFile } from "./release-file";

export interface Manifest {
  schemaVersion: 1;
  version: string;
  platform: Platform;
  architecture: Architecture;
  executable: string;
  workingDirectory: string;
  files: ReleaseFile[];
}
