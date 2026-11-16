import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Tanks Launcher",
    identifier: "com.tanks.launcher",
    version: "0.1.0"
  },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "packages/launcher/src/main/index.ts" },
    copy: {
      "dist/view": "views/main"
    }
  }
} satisfies ElectrobunConfig;
