import { LauncherError } from "./models";
import type { InstallationService, ProcessService, SettingsService } from "./ports";
import type { StateService } from "./state-service";

export class GameUseCase {
  constructor(
    private readonly _state: StateService,
    private readonly _settings: SettingsService,
    private readonly _disk: InstallationService,
    private readonly _processes: ProcessService
  ) {}

  async execute(type: string): Promise<void> {
    const state = this._state;
    const root = state.value.destination;

    if (root === undefined) {
      throw new LauncherError("files");
    }

    const release = await this._disk.lock(root);

    try {
      await this._disk.recover(root);

      const manifest = await this._disk.installed(root);

      if (type === "uninstall") {
        if (manifest && await this._processes.running(root, manifest)) {
          throw new LauncherError("busy");
        }

        state.update({ phase: "finishing", progress: null });

        await this._disk.uninstall(root);
        await state.persist(this._settings, { destination: undefined });
        await this._disk.completeUninstall(root);

        state.installed = undefined;
        state.pending = undefined;

        state.update({ installed: undefined, pending: false,
          paused: false, running: false, missingDestination: false });

        return;
      }

      if (manifest === undefined) {
        throw new LauncherError("files");
      }

      if (type === "play") {
        if (await this._disk.pending(root) !== undefined) {
          throw new LauncherError("busy");
        }

        await this._processes.play(root, manifest);
      }

      if (type === "stop") {
        await this._processes.stop(root, manifest);
      }

      state.installed = manifest;

      state.update({ installed: { version: manifest.version } });
    }
    catch (error) {
      if (type === "uninstall") {
        await state.persist(this._settings, { destination: root });

        state.installed = await this._disk.installed(root);
        state.pending = await this._disk.pending(root);

        state.update({ installed: state.installed
          && { version: state.installed.version },
        pending: state.pending !== undefined, paused: state.pending !== undefined });
      }

      throw error;
    }
    finally {
      state.update({ phase: "idle" });

      await release();
    }
  }
}
