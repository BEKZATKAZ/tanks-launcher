import { validateVersion } from "@tanks/core";

export class NativePatchNotesService {
  async fetch(version: string): Promise<string | undefined> {
    try {
      validateVersion(version);
      const tags = version.startsWith("v") ? [version] : [version, `v${version}`];
      for (const tag of tags) {
        const response = await fetch(
          `https://api.github.com/repos/BEKZATKAZ/tank-game/releases/tags/${encodeURIComponent(tag)}`,
          { headers: { "Accept": "application/vnd.github+json", "User-Agent": "tanks-launcher" },
            signal: AbortSignal.timeout(10000) }
        );
        if (response.status === 404) {
          await response.body?.cancel();
          continue;
        }
        if (response.ok === false) {
          await response.body?.cancel();
          return;
        }
        const release: unknown = await response.json();
        if (release !== null && typeof release === "object" && "body" in release
          && typeof release.body === "string" && release.body.trim().length > 0) {
          return release.body;
        }
        return;
      }
    }
    catch {
      return;
    }
  }
}
