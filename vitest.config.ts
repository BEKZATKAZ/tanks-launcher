import { defineConfig } from "vitest/config";
import { csvPlugin } from "./scripts/csv-plugin";

export default defineConfig({
  plugins: [csvPlugin()],
  test: {
    environment: "node",
    include: ["packages/*/__tests__/**/*.test.ts"]
  }
});
