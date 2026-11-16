import type { ClockService } from "@tanks/core";

export class NativeClockService implements ClockService {
  now(): number {
    return performance.now();
  }

  every(milliseconds: number, callback: () => void): () => void {
    const timer = setInterval(callback, milliseconds);
    timer.unref();

    return () => clearInterval(timer);
  }
}
