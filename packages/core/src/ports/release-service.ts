import type { OperationControl } from "../control";
import type { Architecture } from "../models/releases/architecture";
import type { Manifest } from "../models/releases/manifest";
import type { Platform } from "../models/releases/platform";
import type { ReleaseFile } from "../models/releases/release-file";

export interface ReleaseService {
  platform: Platform;
  architecture: Architecture;
  latest(): Promise<string>;
  manifest(version: string): Promise<Manifest>;
  download(
    manifest: Manifest,
    file: ReleaseFile,
    target: string,
    control: OperationControl,
    progress: (bytes: number, received?: number) => void
  ): Promise<void>;
}
