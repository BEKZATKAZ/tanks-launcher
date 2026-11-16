import type { Command, ErrorCode } from "@tanks/core";

export interface LauncherBridge {
  command(command: Command): Promise<{ error?: ErrorCode }>;
  patchNotes(version: string): Promise<string | undefined>;
  chooseFolder(): Promise<string | undefined>;
}
