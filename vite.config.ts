import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { csvPlugin } from "./scripts/csv-plugin";

export default defineConfig({
  plugins: [csvPlugin()],
  resolve: {
    alias: {
      "electrobun/view": fileURLToPath(new URL(
        "./.hutch/devkit/api/browser/index.ts", import.meta.url))
    }
  },
  root: fileURLToPath(new URL("./packages/launcher/src/view", import.meta.url)),
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("./dist/view", import.meta.url)),
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
