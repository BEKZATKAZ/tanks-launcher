import { homedir } from "node:os";
import { join } from "node:path";
import { LauncherError } from "@tanks/core";
import type { Language, Settings, SettingsService } from "@tanks/core";
import { atomicJson, isMissing, readJson } from "./filesystem";

export function configDirectory(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "TanksLauncher");
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "TanksLauncher");
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "tanks-launcher");
}

export function systemLanguage(): Language {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2);

  return locale === "ru" || locale === "fr" ? locale : "en";
}

export class NativeSettingsService implements SettingsService {
  constructor(private readonly _path = join(configDirectory(), "settings.json")) {}

  readonly defaultDestination = join(homedir(), "Games", "T.A.N.K.S.");

  async load(): Promise<Settings> {
    try {
      const value = await readJson(this._path) as Settings;

      if (value === null || typeof value !== "object"
        || ["en", "ru", "fr"].includes(value.language) === false
        || (value.destination !== undefined
          && typeof value.destination !== "string")) {
        throw new LauncherError("settings");
      }

      return { language: value.language, destination: value.destination };
    }
    catch (error) {
      if (isMissing(error)) {
        return { language: systemLanguage() };
      }

      throw new LauncherError("settings");
    }
  }

  async save(settings: Settings): Promise<void> {
    try {
      await atomicJson(this._path, settings);
    }
    catch {
      throw new LauncherError("settings");
    }
  }
}
