import type { Settings } from "../models/launcher/settings";

export interface SettingsService {
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
  defaultDestination: string;
}
