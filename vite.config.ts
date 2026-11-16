import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
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
