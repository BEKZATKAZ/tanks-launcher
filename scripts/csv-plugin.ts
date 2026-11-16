import type { Plugin } from "vite";

export function csvPlugin(): Plugin {
  return {
    name: "localization-csv",
    enforce: "pre",
    transform(source, id) {
      if (id.endsWith(".csv")) {
        return { code: `export default ${JSON.stringify(source)};`, map: null };
      }
    }
  };
}
