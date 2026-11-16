import { BrowserWindow, BuildConfig } from "electrobun/main";
import "./composition-root";

const config = await BuildConfig.get();
const devUrl = config.buildEnvironment === "dev" ? process.env.TANKS_LAUNCHER_DEV_URL : undefined;

new BrowserWindow({
  title: "Launcher",
  url: devUrl ?? "views://main/index.html",
  frame: { width: 960, height: 640, x: 200, y: 200 }
});
