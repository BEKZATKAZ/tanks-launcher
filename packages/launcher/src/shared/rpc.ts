import type { Command, Snapshot } from "@tanks/core";
import type { CommandResult } from "./models/command-result";

export type LauncherRPC = {
  bun: {
    requests: {
      patchNotes: { params: string, response: string | undefined };
      snapshot: { params: undefined, response: Snapshot };
      command: { params: Command, response: CommandResult };
      chooseFolder: { params: undefined, response: string | undefined };
    };
    messages: Record<never, never>;
  };
  webview: {
    requests: Record<never, never>;
    messages: { state: Snapshot };
  };
};
