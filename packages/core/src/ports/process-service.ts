import type { Manifest } from "../models/releases/manifest";

export interface ProcessService {
  running(root: string, manifest: Manifest): Promise<boolean>;
  play(root: string, manifest: Manifest): Promise<void>;
  stop(root: string, manifest: Manifest): Promise<void>;
}
