
import { LauncherError, LauncherService, parseCommand } from "@tanks/core";
import type { Architecture, Platform } from "@tanks/core";
import {
  NativePatchNotesService, NativeClockService, NativeInstallationService, NativeProcessService, NativeReleaseService,
  NativeSettingsService
} from "@tanks/adapters";
import { BrowserView, Utils } from "electrobun/main";
import { text } from "../localization";
import type { LauncherRPC } from "../shared/rpc";
import { WindowTitleViewModel } from "../view-models/window-title-view-model";

const platform: Platform = process.platform === "win32"
  ? "windows"
  : process.platform === "darwin" ? "macos" : "linux";
const architecture = process.arch as Architecture;
const disk = new NativeInstallationService();
const settings = new NativeSettingsService();

const service = new LauncherService(settings, disk,
  new NativeReleaseService(platform, architecture), new NativeProcessService(),
  new NativeClockService());

const patchNotes = new NativePatchNotesService();

let polling = false;
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
let updateTitle: (() => void) | undefined;

export const rpc = BrowserView.defineRPC<LauncherRPC>({
  maxRequestTime: 30000,
  handlers: {
    requests: {
      patchNotes: version => patchNotes.fetch(version),
      snapshot: () => service.snapshot,
      chooseFolder: async () => {
        const result = await Utils.openFileDialog({
          startingFolder: service.snapshot.destination
            ?? settings.defaultDestination,
          canChooseFiles: false, canChooseDirectory: true,
          allowsMultipleSelection: false
        });

        return result[0];
      },
      command: async value => {
        try {
          const command = parseCommand(value);
          const state = service.snapshot;

          if (command.type === "browse") {
            if (state.destination === undefined
              || await disk.exists(state.destination) === false) {
              throw new LauncherError("files");
            }

            if (Utils.openPath(state.destination) === false) {
              throw new LauncherError("files");
            }

            return {};
          }

          if (command.type === "uninstall") {
            if (service.state.busy || state.running) {
              throw new LauncherError("busy");
            }

            const result = await Utils.showMessageBox({
              type: "warning",
              title: text(state.language, "uninstallTitle"),
              message: text(state.language, "uninstallMessage"),
              detail: state.destination,
              buttons: [text(state.language, "cancel"),
                text(state.language, "uninstall")],
              defaultId: 0, cancelId: 0
            });

            if (result.response !== 1) {
              return {};
            }
          }

          if (["x64", "arm64"].includes(architecture) === false) {
            throw new LauncherError("unsupported");
          }

          void service.execute(command);

          return {};
        }
        catch (error) {
          const code = error instanceof LauncherError ? error.code : "files";

          service.state.update({ error: code });

          return { error: code };
        }
      }
    },
    messages: {}
  }
});

service.state.listeners.add(() => {
  if (notifyTimer !== undefined) {
    return;
  }

  notifyTimer = setTimeout(() => {
    notifyTimer = undefined;
    rpc.send.state(service.snapshot);
    updateTitle?.();
  }, 80);
});

export async function initialize(): Promise<void> {
  await service.initialize();

  setInterval(() => {
    if (polling) {
      return;
    }

    polling = true;

    void service.poll().catch(error => service.state.fail(error))
      .finally(() => { polling = false; });
  }, 2000).unref();
}

export function onTitleChanged(listener: (title: string) => void): void {
  const model = new WindowTitleViewModel();
  let previous = "";

  updateTitle = () => {
    const title = model.format(service.snapshot);

    if (title !== previous) {
      previous = title;
      listener(title);
    }
  };

  updateTitle();
}
