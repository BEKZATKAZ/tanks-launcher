import { describe, expect, it } from "vitest";
import type { Snapshot } from "@tanks/core";
import { WindowTitleViewModel } from "../src/view-models/window-title-view-model";

function state(patch: Partial<Snapshot> = {}): Snapshot {
  return {
    revision: 1, operationId: 1, language: "en", defaultDestination: "/game",
    running: false, phase: "updating", paused: false, pending: true,
    progress: 0.5, missingDestination: false, downloadBytesPerSecond: 1000000,
    totalBytes: 2400000000, ...patch
  };
}

describe("window title", () => {
  const model = new WindowTitleViewModel();

  it("places localized status before percentage, speed, and full game size", () => {
    expect(model.format(state())).toBe("Updating 50% — 8 Mbps / 2.4 GB");
    expect(model.format(state({ language: "ru", phase: "installing" })))
      .toBe("Установка 50 % — 8 Мбит/с / 2,4 ГБ");
    expect(model.format(state({ language: "fr", phase: "verifying",
      downloadBytesPerSecond: 0 })))
      .toBe("Vérification 50 % — 0 kbit/s / 2,4 Go");
  });

  it("uses kilobits for slow downloads and megabytes for smaller games", () => {
    expect(model.format(state({ downloadBytesPerSecond: 62500,
      totalBytes: 400000000 })))
      .toBe("Updating 50% — 500 kbps / 400 MB");
  });

  it("keeps the original idle name and handles preparation and pause", () => {
    expect(model.format(state({ phase: "idle", pending: false, language: "fr" })))
      .toBe("Launcher");
    expect(model.format(state({ phase: "preparing", progress: null,
      totalBytes: undefined }))).toBe("Preparing — Launcher");
    expect(model.format(state({ paused: true, phase: "idle",
      downloadBytesPerSecond: 0 })))
      .toBe("Paused 50% — 0 kbps / 2.4 GB");
  });
});
