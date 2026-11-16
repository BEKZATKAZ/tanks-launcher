import type { Command, Language, Snapshot } from "@tanks/core";
import { languages, text } from "../localization";
import type { LauncherBridge } from "../ports/launcher-bridge";

export class LauncherViewModel {
  constructor(private readonly _bridge: LauncherBridge) {}

  state?: Snapshot;
  destinationOpen = false;
  destination = "";
  menuOpen = false;
  languagesOpen = false;
  connectionError = false;
  sending = false;
  changed: () => void = () => {};

  receive(snapshot: Snapshot): void {
    if (this.state !== undefined && snapshot.revision < this.state.revision) {
      return;
    }

    this.state = snapshot;
    this.connectionError = false;

    this.changed();
  }

  get language(): Language {
    return this.state?.language ?? "en";
  }

  get selectedLanguage() {
    return languages.find(language => language.id === this.language)!;
  }

  t(key: string): string {
    return text(this.language, key);
  }

  get active(): boolean {
    return this.state !== undefined && this.state.phase !== "idle";
  }

  get action(): string {
    const state = this.state;

    if (state === undefined) {
      return "preparing";
    }

    if (state.phase === "checking") {
      return "checking";
    }

    if (state.running) {
      return "stop";
    }

    if (this.active) {
      return state.phase === "idle" ? "preparing" : state.phase;
    }

    if (state.pending) {
      return state.error ? "retry" : "paused";
    }

    if (state.installed === undefined || state.missingDestination) {
      return "install";
    }

    return state.targetVersion !== undefined
      && state.targetVersion !== state.installed.version
      ? "update"
      : "play";
  }

  get canPause(): boolean {
    return this.state !== undefined && ["installing", "updating", "verifying"]
      .includes(this.state.phase);
  }

  get canManage(): boolean {
    return this.state?.installed !== undefined && this.active === false
      && this.state.running === false && this.state.pending === false
      && this.sending === false;
  }

  get canUninstall(): boolean {
    return this.state?.destination !== undefined && this.active === false
      && this.state.running === false && this.sending === false;
  }

  get percent(): string {
    const value = this.state?.progress;

    return value == null
      ? ""
      : new Intl.NumberFormat(this.language, {
          style: "percent", maximumFractionDigits: 0
        }).format(Math.max(0, Math.min(1, value)));
  }

  get error(): string {
    if (this.connectionError) {
      return this.t("connection");
    }

    const key = this.state?.error;

    return key ? this.t(key === "destination" ? "destinationError" : key) : "";
  }

  async primary(): Promise<void> {
    if (this.active || this.sending || this.state === undefined) {
      return;
    }

    if (this.state.running) {
      await this.send({ type: "stop" });
      return;
    }

    if (this.state.pending) {
      await this.send({ type: "resume" });
      return;
    }

    if (this.state.destination === undefined || this.state.missingDestination) {
      this.destination = this.state.destination ?? this.state.defaultDestination;
      this.destinationOpen = true;

      this.changed();

      return;
    }

    await this.send({ type: this.action === "play" ? "play" : "install" });
  }

  async confirmDestination(): Promise<void> {
    if (this.destination.trim().length === 0) {
      return;
    }

    this.destinationOpen = false;

    await this.send({ type: "install", destination: this.destination.trim() });
  }

  async chooseFolder(): Promise<void> {
    try {
      this.destination = await this._bridge.chooseFolder() ?? this.destination;
    }
    catch {
      this.connectionError = true;
    }

    this.changed();
  }

  async send(command: Command): Promise<void> {
    this.sending = true;
    this.menuOpen = false;
    this.languagesOpen = false;

    this.changed();

    try {
      const result = await this._bridge.command(command);

      this.connectionError = false;

      if (result.error !== undefined && this.state !== undefined) {
        this.state = { ...this.state, error: result.error };
      }
    }
    catch {
      this.connectionError = true;
    }
    finally {
      this.sending = false;

      this.changed();
    }
  }
}
