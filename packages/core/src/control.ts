import { PausedError } from "./errors/paused-error";
export { PausedError } from "./errors/paused-error";

export class OperationControl {
  private _paused = false;
  private readonly _listeners = new Set<() => void>();

  get paused(): boolean {
    return this._paused;
  }

  check(): void {
    if (this._paused) {
      throw new PausedError();
    }
  }

  onPause(listener: () => void): () => void {
    this._listeners.add(listener);

    if (this._paused) {
      listener();
    }

    return () => this._listeners.delete(listener);
  }

  pause(): void {
    this._paused = true;

    for (const listener of this._listeners) {
      listener();
    }
  }
}
