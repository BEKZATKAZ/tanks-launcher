
import { Electroview } from "electrobun/view";
import { languages } from "../localization";
import type { LauncherRPC } from "../shared/rpc";
import { LauncherViewModel } from "../view-models/launcher-view-model";
import { element, flags, render } from "./render";

const rpc = Electroview.defineRPC<LauncherRPC>({
  maxRequestTime: 30000,
  handlers: {
    requests: {},
    messages: { state: snapshot => model.receive(snapshot) }
  }
});

const model = new LauncherViewModel({
  command: command => rpc.request.command(command),
  chooseFolder: () => rpc.request.chooseFolder()
});

new Electroview({ rpc });
model.changed = () => render(model);

for (const language of languages) {
  const button = document.createElement("button");
  const flag = document.createElement("img");

  flag.src = flags[language.flag];
  flag.alt = "";
  flag.width = 24;
  flag.height = 16;

  button.append(flag, document.createTextNode(language.name));
  button.dataset.language = language.id;
  button.setAttribute("role", "menuitemradio");

  button.addEventListener("click", () => {
    void model.send({ type: "language", language: language.id });
    element("language-toggle").focus();
  });

  element("language-menu").append(button);
}

element("primary").addEventListener("click", () => void model.primary());

element("pause").addEventListener("click", () => {
  void model.send({ type: model.canPause ? "pause" : "resume" });
});

element("destination").addEventListener("input", event => {
  model.destination = (event.target as HTMLInputElement).value;
});

element("destination-form").addEventListener("submit", event => {
  event.preventDefault();

  void model.confirmDestination();
});

element("choose-folder").addEventListener("click", () => {
  void model.chooseFolder().then(() => {
    element<HTMLInputElement>("destination").value = model.destination;
  });
});

element("cancel-destination").addEventListener("click", () => {
  model.destinationOpen = false;
  render(model);
});

element("destination-dialog").addEventListener("cancel", () => {
  model.destinationOpen = false;
});

for (const type of ["browse", "verify", "uninstall", "check"] as const) {
  element(type).addEventListener("click", () => {
    void model.send({ type });
    element("more").focus();
  });
}

function toggleMenu(menu: "menuOpen" | "languagesOpen"): void {
  model[menu] = model[menu] === false;
  render(model);

  if (model[menu]) {
    element(menu === "menuOpen" ? "more-menu" : "language-menu")
      .querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
}

element("more").addEventListener("click", () => toggleMenu("menuOpen"));
element("language-toggle")
  .addEventListener("click", () => toggleMenu("languagesOpen"));

document.addEventListener("click", event => {
  const target = event.target as Node;

  if (element("more-container").contains(target) === false) {
    model.menuOpen = false;
  }

  if (element("language-picker").contains(target) === false) {
    model.languagesOpen = false;
  }

  render(model);
});

document.addEventListener("keydown", event => {
  const menu = model.languagesOpen
    ? "language-menu"
    : model.menuOpen ? "more-menu" : undefined;

  if (menu === undefined) {
    return;
  }

  if (event.key === "Escape") {
    model.menuOpen = false;
    model.languagesOpen = false;
    render(model);
    element(menu === "language-menu" ? "language-toggle" : "more").focus();
  }

  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();

    const buttons = [...element(menu)
      .querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current
          + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;

    buttons[next]?.focus();
  }
});

render(model);

void rpc.request.snapshot().then(snapshot => model.receive(snapshot)).catch(() => {
  model.connectionError = true;
  render(model);
});
