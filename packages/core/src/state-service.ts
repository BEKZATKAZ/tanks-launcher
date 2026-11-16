import { LauncherError } from "./models";
import type { Manifest, PendingOperation, Snapshot } from "./models";
import type { SettingsService } from "./ports";

export class StateService {
  constructor(defaultDestination: string) {
    this.value = {
      revision: 0, operationId: 0, language: "en", defaultDestination,
      running: false, phase: "preparing", paused: false, pending: false,
      progress: null, missingDestination: false
    };
  }

  readonly listeners = new Set<(state: Snapshot) => void>();
  value: Snapshot;
  installed?: Manifest;
  pending?: PendingOperation;
  busy = false;
  ready = false;
  private _saving: Promise<void> = Promise.resolve();

  async persist(settings: SettingsService, patch: Partial<Snapshot>): Promise<void> {
    const previous = this.value;

    this.update(patch);

    const save = this._saving.catch(() => {}).then(() => settings.save({
      language: this.value.language, destination: this.value.destination
    }));

    this._saving = save;

    try {
      await save;
    }
    catch (error) {
      const restore: Partial<Snapshot> = {};

      for (const key of Object.keys(patch) as (keyof Snapshot)[]) {
        if (this.value[key] === patch[key]) {
          Object.assign(restore, { [key]: previous[key] });
        }
      }

      this.update(restore);
      throw error;
    }
  }

  update(patch: Partial<Snapshot>): void {
    this.value = { ...this.value, ...patch, revision: this.value.revision + 1 };

    for (const listener of this.listeners) {
      listener(this.value);
    }
  }

  fail(error: unknown): void {
    const code = error instanceof LauncherError ? error.code : "files";

    this.update({ error: code });
  }
}
