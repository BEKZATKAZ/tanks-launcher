import type { ClockService } from "./ports/clock-service";

export class DownloadMeterService {
  constructor(private readonly _clock: ClockService) {
    this._started = _clock.now();
    this._samples = [{ time: this._started, bytes: 0 }];
  }

  private readonly _started: number;
  private readonly _samples: { time: number; bytes: number }[];
  private _bytes = 0;

  record(bytes: number): void {
    this._bytes += bytes;
  }

  speed(): number {
    const now = this._clock.now();

    while (this._samples.length > 1 && this._samples[1].time <= now - 1000) {
      this._samples.shift();
    }

    const oldest = this._samples[0];
    const elapsed = Math.max(1, now - oldest.time);
    const speed = Math.max(0, (this._bytes - oldest.bytes) * 1000 / elapsed);

    if (now - this._samples[this._samples.length - 1].time >= 200) {
      this._samples.push({ time: now, bytes: this._bytes });
    }

    return speed;
  }
}
