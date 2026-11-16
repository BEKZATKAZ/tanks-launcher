import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer();
await server.listen();
server.printUrls();

const app = spawn(process.execPath, [
  fileURLToPath(new URL("../node_modules/electrobun/bin/electrobun.cjs", import.meta.url)),
  "dev"
], {
  stdio: "inherit",
  env: { ...process.env, TANKS_LAUNCHER_DEV_URL: server.resolvedUrls.local[0] }
});

let stopping = false;

async function stop(code) {
  if (stopping) return;
  stopping = true;

  if (app.exitCode === null && app.signalCode === null && app.pid) {
    if (process.platform === "win32") {
      await new Promise(resolve => {
        const killer = spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { windowsHide: true });
        killer.once("error", resolve);
        killer.once("exit", resolve);
      });
    } else {
      app.kill("SIGTERM");
    }
  }

  await server.close();
  process.exitCode = code;
}

app.once("error", error => {
  console.error(error);
  void stop(1);
});

app.once("exit", code => { void stop(code ?? 1); });

process.once("SIGINT", () => { void stop(0); });
process.once("SIGTERM", () => { void stop(0); });

console.log("UI changes reload live. Restart pnpm dev after changing native main-process code.");
