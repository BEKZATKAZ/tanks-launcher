import type { OperationControl } from "../control";
import type { PendingOperation } from "../models/installation/pending-operation";
import type { Manifest } from "../models/releases/manifest";
import type { ReleaseFile } from "../models/releases/release-file";

export interface InstallationService {
  exists(root: string): Promise<boolean>;
  validateDestination(root: string): Promise<string>;
  lock(root: string): Promise<() => Promise<void>>;
  installed(root: string): Promise<Manifest | undefined>;
  pending(root: string): Promise<PendingOperation | undefined>;
  prepare(root: string, pending: PendingOperation): Promise<void>;
  matches(
    root: string,
    file: ReleaseFile,
    control: OperationControl,
    progress?: (bytes: number) => void
  ): Promise<boolean>;
  stage(root: string): string;
  space(root: string, bytes: number): Promise<void>;
  recover(root: string): Promise<void>;
  commit(root: string, manifest: Manifest): Promise<void>;
  uninstall(root: string): Promise<void>;
  completeUninstall(root: string): Promise<void>;
}
