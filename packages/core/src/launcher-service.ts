import { GameUseCase } from "./game-use-case";
import { InstallationUseCase } from "./installation-use-case";
import { LauncherError } from "./models";
import type { Command, Snapshot } from "./models";
import type {
  ClockService, InstallationService, ProcessService, ReleaseService, SettingsService
} from "./ports";
import { StateService } from "./state-service";

export class LauncherService {
  constructor(
    private readonly _settings: SettingsService,
    private readonly _disk: InstallationService,
    private readonly _releases: ReleaseService,
    private readonly _processes: ProcessService,
    clock: ClockService
  ) {
    this.state = new StateService(_settings.defaultDestination);

    this._installation = new InstallationUseCase(
      this.state, _settings, _disk, _releases, _processes, clock);
  }

  readonly state: StateService;
  private readonly _installation: InstallationUseCase;

  get snapshot(): Snapshot {
    return this.state.value;
  }

  async initialize(): Promise<void> {
    const state = this.state;

    try {
      const settings = await this._settings.load();

      state.update(settings);

      if (settings.destination !== undefined) {
        const root = settings.destination;

        if (await this._disk.exists(root) === false) {
          state.update({ missingDestination: true });
        }
        else {
          await this._disk.validateDestination(root);

          const release = await this._disk.lock(root);

          try {
            await this._disk.recover(root);

            state.installed = await this._disk.installed(root);
            state.pending = await this._disk.pending(root);
          }
          finally {
            await release();
          }

          state.update({ installed: state.installed
            && { version: state.installed.version },
          pending: state.pending !== undefined,
          paused: state.pending !== undefined,
          targetVersion: state.pending?.manifest.version });

          state.update({ totalBytes: (state.pending?.manifest ?? state.installed)
            ?.files.reduce((sum, file) => sum + file.size, 0) });

          await this.poll();
        }
      }
    }
    catch (error) {
      state.fail(error);
    }

    state.ready = true;

    state.update({ phase: "idle" });

    await this.check();
  }

  async execute(command: Command): Promise<void> {
    const state = this.state;

    if (command.type === "pause") {
      this._installation.pause();

      return;
    }

    if (command.type === "language") {
      try {
        await state.persist(this._settings, { language: command.language });
      }
      catch (error) {
        state.fail(error);
      }

      return;
    }

    if (state.busy || state.ready === false) {
      return;
    }

    state.busy = true;

    try {
      if (command.type === "check") {
        await this.check();

        return;
      }

      await this.poll();

      if (state.value.running && command.type !== "stop") {
        throw new LauncherError("busy");
      }

      state.update({ error: undefined });

      if (command.type === "install" || command.type === "verify"
        || command.type === "resume") {
        await this._installation.run(command.type,
          command.type === "install" ? command.destination : undefined);

        return;
      }

      await new GameUseCase(state, this._settings, this._disk,
        this._processes).execute(command.type);

      await this.poll();
    }
    catch (error) {
      state.fail(error);
    }
    finally {
      state.busy = false;
    }
  }

  async poll(): Promise<void> {
    const root = this.state.value.destination;
    const manifest = this.state.installed;

    if (root !== undefined && manifest !== undefined) {
      const running = await this._processes.running(root, manifest);

      if (running !== this.state.value.running) {
        this.state.update({ running });
      }
    }
  }

  private async check(): Promise<void> {
    try {
      const targetVersion = await this._releases.latest();

      if (this.state.pending === undefined) {
        this.state.update({ targetVersion });
      }
    }
    catch (error) {
      this.state.fail(error);
    }
  }
}
