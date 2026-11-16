import { BrowserWindow, BuildConfig } from "electrobun/main";
import { initialize, onTitleChanged, rpc } from "./composition-root";

const config = await BuildConfig.get();
const devUrl = config.buildEnvironment === "dev"
  ? process.env.TANKS_LAUNCHER_DEV_URL
  : undefined;

const window = new BrowserWindow({
  title: "Launcher",
  rpc,
  url: devUrl ?? "views://main/index.html",
  frame: { width: 960, height: 640, x: 200, y: 200 }
});

onTitleChanged(title => window.setTitle(title));

void initialize();
