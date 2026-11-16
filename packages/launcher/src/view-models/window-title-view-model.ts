import type { Snapshot } from "@tanks/core";
import { text } from "../localization";

export class WindowTitleViewModel {
  format(state: Snapshot): string {
    if (state.phase === "idle" && state.pending === false) {
      return "Launcher";
    }

    const language = state.language;
    const status = text(language, state.paused ? "paused" : state.phase);

    if (state.totalBytes === undefined) {
      return text(language, "statusTitle").replace("{status}", status);
    }

    const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
    const bits = (state.downloadBytesPerSecond ?? 0) * 8;
    const speedUnit = bits >= 1000000 ? "megabitsPerSecond" : "kilobitsPerSecond";
    const speedValue = bits / (bits >= 1000000 ? 1000000 : 1000);
    const sizeUnit = state.totalBytes >= 1000000000 ? "gigabytes" : "megabytes";
    const sizeValue = state.totalBytes
      / (state.totalBytes >= 1000000000 ? 1000000000 : 1000000);
    const speed = text(language, speedUnit)
      .replace("{value}", number.format(speedValue));
    const size = text(language, sizeUnit)
      .replace("{value}", number.format(sizeValue));
    const progress = state.progress === null
      ? ""
      : new Intl.NumberFormat(language, {
          style: "percent", maximumFractionDigits: 0
        }).format(state.progress);

    return text(language, "operationTitle")
      .replace("{status}", status)
      .replace("{progress}", progress)
      .replace("{speed}", speed)
      .replace("{size}", size)
      .replace("  ", " ");
  }
}
