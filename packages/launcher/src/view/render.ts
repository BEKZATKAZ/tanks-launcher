import { patchNotesHtml } from "../localization/patch-notes";
import { languages } from "../localization";
import type { LauncherViewModel } from "../view-models/launcher-view-model";

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const result = document.getElementById(id);

  if (result === null) {
    throw new Error(`Missing element: ${id}`);
  }

  return result as T;
}

export const flags: Record<string, string> = {
  gb: new URL("./assets/flags/gb.svg", import.meta.url).href,
  ru: new URL("./assets/flags/ru.svg", import.meta.url).href,
  fr: new URL("./assets/flags/fr.svg", import.meta.url).href
};

export function render(model: LauncherViewModel): void {
  const state = model.state;

  document.documentElement.lang = model.language;

  for (const node of document.querySelectorAll<HTMLElement>("[data-text]")) {
    node.textContent = model.t(node.dataset.text ?? "");
  }

  element("action-label").textContent = model.t(model.action);
  element<HTMLButtonElement>("primary").disabled = model.active
    || model.sending || state === undefined;

  element("percentage").textContent = model.percent;
  element("progress-fill").style.width = `${(state?.progress ?? 0) * 100}%`;

  element("main-control").classList.toggle("indeterminate",
    model.active && state?.progress === null);

  element("main-control").classList.toggle("in-progress", model.active);

  const pause = element<HTMLButtonElement>("pause");
  pause.hidden = model.canPause === false && state?.pending !== true;
  pause.disabled = model.sending || (model.active && model.canPause === false);

  const pauseLabel = model.canPause ? "pause" : "resume";
  pause.setAttribute("aria-label", model.t(pauseLabel));
  pause.title = model.t(pauseLabel);

  element("pause-icon").hidden = model.canPause === false;
  element("resume-icon").hidden = model.canPause;

  element("more").setAttribute("aria-label", model.t("more"));
  element("more").setAttribute("aria-expanded", String(model.menuOpen));
  element("more-menu").hidden = model.menuOpen === false;

  for (const id of ["browse", "verify", "uninstall"]) {
    element<HTMLButtonElement>(id).disabled = (id === "verify"
      ? model.canManage
      : model.canUninstall) === false;
  }

  element("language-toggle").setAttribute("aria-label", model.t("language"));
  element("language-toggle")
    .setAttribute("aria-expanded", String(model.languagesOpen));

  element("language-menu").hidden = model.languagesOpen === false;

  const selectedFlag = element<HTMLImageElement>("selected-flag");
  selectedFlag.src = flags[model.selectedLanguage.flag];

  element("selected-language").textContent = model.selectedLanguage.name;

  for (const language of languages) {
    document.querySelector(`[data-language="${language.id}"]`)
      ?.setAttribute("aria-checked", String(language.id === model.language));
  }

  element("error").hidden = model.error.length === 0;
  element("error").textContent = model.error;

  element<HTMLButtonElement>("check").disabled = model.active || model.sending;

  element("version").textContent = state?.installed
    ? `${model.t("installedVersion")}: ${state.installed.version}`
    : "";

  const announcement = `${model.t(model.action)} ${model.percent}`;

  if (element("progress-announcement").textContent !== announcement) {
    element("progress-announcement").textContent = announcement;
  }

  const dialog = element<HTMLDialogElement>("destination-dialog");

  if (model.destinationOpen && dialog.open === false) {
    element<HTMLInputElement>("destination").value = model.destination;
    dialog.showModal();
  }

  if (model.destinationOpen === false && dialog.open) {
    dialog.close();
    element("primary").focus();
  }

  const notes = element<HTMLDialogElement>("patch-notes-dialog");
  const body = element("patch-notes-body");
  const contentKey = JSON.stringify([model.patchNotesBody, model.language]);
  if (body.dataset.contentKey !== contentKey) {
    body.innerHTML = patchNotesHtml(model.patchNotesBody, key => model.t(key));
    body.dataset.contentKey = contentKey;
  }
  element("patch-notes-loading").hidden = model.patchNotesBody.length > 0;
  if (model.patchNotesOpen && notes.open === false) {
    notes.showModal();
  }
  if (model.patchNotesOpen === false && notes.open) {
    notes.close();
    element("primary").focus();
  }

  element("recreate").hidden = state?.missingDestination !== true;
}
