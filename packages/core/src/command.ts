import { LauncherError } from "./models";
import type { Command } from "./models";

export function parseCommand(value: unknown): Command {
  if (value === null || typeof value !== "object") {
    throw new LauncherError("manifest");
  }

  const command = value as Command;

  if (command.type === "language"
    && ["en", "ru", "fr"].includes(command.language)) {
    return { type: "language", language: command.language };
  }

  if (command.type === "install"
    && (command.destination === undefined
      || (typeof command.destination === "string"
        && command.destination.length <= 4096
        && command.destination.includes("\0") === false))) {
    return { type: "install", destination: command.destination };
  }

  if (["resume", "pause", "verify", "play", "stop", "browse", "uninstall", "check"]
    .includes(command.type)) {
    return { type: command.type } as Command;
  }

  throw new LauncherError("manifest");
}
