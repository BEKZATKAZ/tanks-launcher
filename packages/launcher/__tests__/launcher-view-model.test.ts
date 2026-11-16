import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@tanks/core";
import { languages, text } from "../src/localization";
import { parseCsv } from "../src/localization/csv";
import source from "../src/localization/strings.csv" with { type: "text" };
import { LauncherViewModel } from "../src/view-models/launcher-view-model";

function setup(patch: Partial<Snapshot> = {}) {
  const bridge = {
    command: vi.fn(async () => ({})),
    chooseFolder: vi.fn(async () => "/chosen")
  };
  const model = new LauncherViewModel(bridge);
  const state: Snapshot = {
    revision: 1, operationId: 1, language: "en", defaultDestination: "/default",
    running: false, phase: "idle", paused: false, pending: false,
    progress: null, missingDestination: false, ...patch
  };
  model.receive(state);
  return { model, bridge, state };
}

describe("launcher view model", () => {
  it("opens destination once, cancellation sends nothing, and confirmed install saves input", async () => {
    const { model, bridge } = setup();
    await model.primary();
    expect(model.destinationOpen).toBe(true);
    expect(model.destination).toBe("/default");
    model.destinationOpen = false;
    expect(bridge.command).not.toHaveBeenCalled();
    await model.primary();
    await model.chooseFolder();
    await model.confirmDestination();
    expect(bridge.command).toHaveBeenCalledWith({ type: "install", destination: "/chosen" });
  });

  it.each([
    [{}, "install"],
    [{ installed: { version: "old" } }, "play"],
    [{ installed: { version: "old" }, targetVersion: "next" }, "update"],
    [{ running: true }, "stop"],
    [{ pending: true, paused: true }, "paused"],
    [{ phase: "updating", progress: 0.4 }, "updating"]
  ])("maps state %j to %s", (patch, action) => {
    expect(setup(patch as Partial<Snapshot>).model.action).toBe(action);
  });

  it("uses remembered paths and requests confirmation for missing directories", async () => {
    const { model, bridge, state } = setup({ destination: "/remembered" });
    await model.primary();
    expect(model.destinationOpen).toBe(false);
    expect(bridge.command).toHaveBeenCalledWith({ type: "install" });
    model.receive({ ...state, revision: 2, missingDestination: true });
    await model.primary();
    expect(model.destinationOpen).toBe(true);
    expect(model.destination).toBe(state.destination);
  });

  it("rejects stale snapshots and localizes ongoing operation progress", () => {
    const { model, state } = setup({ phase: "verifying", progress: 0.35 });
    model.receive({ ...state, revision: 3, language: "fr" });
    model.receive({ ...state, revision: 2, language: "ru" });
    expect(model.language).toBe("fr");
    expect(model.t(model.action)).toBe(text("fr", "verifying"));
    expect(model.percent).toBe(new Intl.NumberFormat("fr", {
      style: "percent", maximumFractionDigits: 0
    }).format(state.progress!));
    expect(model.canManage).toBe(false);
    expect(model.canPause).toBe(true);
  });

  it("resumes pending work and disables management while running", async () => {
    const { model, bridge, state } = setup({ pending: true, paused: true });
    await model.primary();
    expect(bridge.command).toHaveBeenCalledWith({ type: "resume" });
    model.receive({ ...state, revision: 2, running: true });
    expect(model.canManage).toBe(false);
    expect(model.canUninstall).toBe(false);
    await model.primary();
    expect(bridge.command).toHaveBeenCalledWith({ type: "stop" });
  });

  it("shows communication failures and recovers on a fresh snapshot", async () => {
    const { model, bridge, state } = setup();
    bridge.command.mockRejectedValueOnce(new Error("disconnected"));
    await model.send({ type: "check" });
    expect(model.error).toBe(text("en", "connection"));
    model.receive({ ...state, revision: 2 });
    expect(model.error).toBe("");
  });
});

describe("Unity-style localization CSV", () => {
  it("has unique keys and IDs and complete language columns", () => {
    const [header, ...rows] = parseCsv(source);
    expect(new Set(rows.map(row => row[0])).size).toBe(rows.length);
    expect(new Set(rows.map(row => row[1])).size).toBe(rows.length);

    for (const language of languages) {
      const column = header.findIndex(value => value.endsWith(`(${language.id})`));
      expect(column).toBeGreaterThan(1);

      for (const row of rows) {
        expect(row[column]?.length).toBeGreaterThan(0);
      }
    }
  });

  it("supports commas, quotes, and multiline translations", () => {
    expect(parseCsv('Key,en\nmessage,"A comma, a ""quote""\nand a newline"\n'))
      .toEqual([["Key", "en"], ["message", 'A comma, a "quote"\nand a newline']]);
  });
});
