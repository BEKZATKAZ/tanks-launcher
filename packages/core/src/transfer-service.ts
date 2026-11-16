import type { OperationControl } from "./control";
import { DownloadMeterService } from "./download-meter-service";
import type {
  Manifest, PendingOperation, Phase, ReleaseFile, TransferMetrics
} from "./models";
import type { ClockService, InstallationService, ReleaseService } from "./ports";

export class TransferService {
  constructor(
    private readonly _disk: InstallationService,
    private readonly _releases: ReleaseService,
    private readonly _clock: ClockService,
    private readonly _concurrency = 6
  ) {}

  async run(
    root: string,
    pending: PendingOperation,
    control: OperationControl,
    report: (phase: Phase, progress: number | null, metrics?: TransferMetrics) => void
  ): Promise<void> {
    const manifest = pending.manifest;
    const required: ReleaseFile[] = [];

    for (const file of manifest.files) {
      control.check();

      if (await this._disk.matches(root, file, control) === false) {
        required.push(file);
      }
    }

    required.sort((left, right) => right.size - left.size);

    await this._disk.space(root, required.reduce((sum, file) =>
      sum + file.size * 2, 0));

    await this.download(root, manifest, required, control,
      pending.operation === "update" ? "updating" : "installing", report);

    const total = manifest.files.reduce((sum, file) => sum + file.size, 0);
    let verified = 0;

    report("verifying", 0, { downloadBytesPerSecond: 0, totalBytes: total });

    for (const file of manifest.files) {
      control.check();

      const stage = this._disk.stage(root);
      let checked = 0;

      const progress = (bytes: number): void => {
        checked += bytes;

        report("verifying", total === 0
          ? 1
          : Math.min(1, (verified + checked) / total));
      };

      const staged = await this._disk.matches(stage, file, control);

      if (staged === false
        && await this._disk.matches(root, file, control, progress) === false) {
        await this._releases.download(manifest, file, stage, control,
          () => {});
      }

      verified += file.size;
      report("verifying", total === 0 ? 1 : verified / total);
    }
  }

  private async download(
    root: string,
    manifest: Manifest,
    files: ReleaseFile[],
    control: OperationControl,
    phase: Phase,
    report: (phase: Phase, progress: number | null, metrics?: TransferMetrics) => void
  ): Promise<void> {
    const total = files.reduce((sum, file) => sum + file.size, 0);
    const bytes = new Map<string, number>();
    let index = 0;
    let failure: unknown;
    let downloaded = 0;
    const meter = new DownloadMeterService(this._clock);
    const totalBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
    const publish = (): void => report(phase, total === 0 ? 1 : downloaded / total,
      { downloadBytesPerSecond: meter.speed(), totalBytes });

    publish();

    const update = (file: ReleaseFile, count: number): void => {
      downloaded += count - (bytes.get(file.path) ?? 0);
      bytes.set(file.path, count);

      publish();
    };

    const worker = async (): Promise<void> => {
      while (index < files.length && failure === undefined) {
        const file = files[index++];

        try {
          control.check();

          if (await this._disk.matches(
            this._disk.stage(root), file, control) === false) {
            await this._releases.download(manifest, file,
              this._disk.stage(root), control, (count, received = 0) => {
                meter.record(received);

                update(file, count);
              });
          }

          update(file, file.size);
        }
        catch (error) {
          failure = error;
        }
      }
    };

    const stop = this._clock.every(250, publish);

    try {
      await Promise.all(Array.from(
        { length: Math.min(files.length, Math.max(1, this._concurrency)) },
        worker));
    }
    finally {
      stop();
    }

    if (failure !== undefined) {
      throw failure;
    }

    report(phase, 1);
  }
}
