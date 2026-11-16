import type { Command, ErrorCode } from "@tanks/core";

export interface LauncherBridge {
  command(command: Command): Promise<{ error?: ErrorCode }>;
  chooseFolder(): Promise<string | undefined>;
}
