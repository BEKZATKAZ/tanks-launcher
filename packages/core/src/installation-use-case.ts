import { OperationControl, PausedError } from "./control";
import { LauncherError } from "./models";
import type { PendingOperation } from "./models";
import type {
  ClockService, InstallationService, ProcessService, ReleaseService, SettingsService
} from "./ports";
import type { StateService } from "./state-service";
import { TransferService } from "./transfer-service";

export class InstallationUseCase {
  constructor(
    private readonly _state: StateService,
    private readonly _settings: SettingsService,
    private readonly _disk: InstallationService,
    private readonly _releases: ReleaseService,
    private readonly _processes: ProcessService,
    private readonly _clock: ClockService
  ) {}

  private _control?: OperationControl;

  pause(): void {
    if (["installing", "updating", "verifying"]
      .includes(this._state.value.phase)) {
      this._control?.pause();
    }
  }

  async run(mode: "install" | "verify" | "resume", destination?: string) {
    const state = this._state;
    let release: (() => Promise<void>) | undefined;
    const control = new OperationControl();

    this._control = control;

    state.update({ phase: "preparing", paused: false, error: undefined,
      operationId: state.value.operationId + 1, progress: null,
      downloadBytesPerSecond: 0, totalBytes: undefined });

    try {
      const selected = state.value.missingDestination
        ? destination ?? state.value.destination
        : state.value.destination ?? destination;

      if (selected === undefined) {
        throw new LauncherError("destination");
      }

      const root = await this._disk.validateDestination(selected);

      release = await this._disk.lock(root);
      await this._disk.recover(root);

      state.installed = await this._disk.installed(root);

      if (state.installed !== undefined
        && await this._processes.running(root, state.installed)) {
        state.update({ running: true });

        throw new LauncherError("busy");
      }

      await state.persist(this._settings, { destination: root });

      state.update({ missingDestination: false,
        installed: state.installed && { version: state.installed.version } });

      let operation = await this._disk.pending(root);

      if (operation !== undefined && mode !== "resume") {
        throw new LauncherError("busy");
      }

      if (operation === undefined) {
        operation = await this.createOperation(mode);

        await this._disk.prepare(root, operation);
      }

      state.pending = operation;

      state.update({ pending: true, targetVersion: operation.manifest.version });

      await new TransferService(this._disk, this._releases, this._clock).run(
        root, operation, control, (phase, progress, metrics) => {
          state.update({ phase, progress, ...metrics });
        });

      control.check();

      if (state.installed !== undefined
        && await this._processes.running(root, state.installed)) {
        state.update({ running: true });

        throw new LauncherError("busy");
      }

      state.update({ phase: "finishing", progress: null });

      await this._disk.commit(root, operation.manifest);

      state.installed = operation.manifest;
      state.pending = undefined;

      state.update({ installed: { version: operation.manifest.version },
        pending: false, progress: null });
    }
    catch (error) {
      if (error instanceof PausedError === false) {
        state.fail(error);
      }
    }
    finally {
      this._control = undefined;

      try {
        await release?.();
      }
      catch (error) {
        state.fail(error);
      }

      state.update({ phase: "idle", paused: state.pending !== undefined,
        pending: state.pending !== undefined, downloadBytesPerSecond: 0 });
    }
  }

  private async createOperation(mode: string): Promise<PendingOperation> {
    if (mode === "verify") {
      if (this._state.installed === undefined) {
        throw new LauncherError("files");
      }

      return { operation: "verify", manifest: this._state.installed };
    }

    const version = await this._releases.latest();
    const manifest = await this._releases.manifest(version);

    return { operation: this._state.installed ? "update" : "install", manifest };
  }
}
