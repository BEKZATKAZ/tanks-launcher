import { LauncherError, validateManifest, validateVersion } from "@tanks/core";
import type {
  Architecture, Manifest, OperationControl, Platform, ReleaseFile, ReleaseService
} from "@tanks/core";
import { DownloadService } from "./download-service";

export const BUCKET = "https://pub-211aae7f888a430b90ae6a8a38a68d5b.r2.dev";

export class NativeReleaseService implements ReleaseService {
  constructor(
    readonly platform: Platform,
    readonly architecture: Architecture,
    private readonly _bucket = BUCKET
  ) {}

  private readonly _downloads = new DownloadService();

  async latest(): Promise<string> {
    const response = await this.request(`${this._bucket}/latest-version.txt`);
    const text = await this.text(response, 1024);

    return validateVersion(text.trim());
  }

  async manifest(version: string): Promise<Manifest> {
    const response = await this.request(`${this.base(version)}/manifest.json`, true);

    try {
      return validateManifest(JSON.parse(await this.text(response, 16000000)),
        version, this.platform, this.architecture);
    }
    catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }

      throw new LauncherError("manifest");
    }
  }

  async download(
    manifest: Manifest,
    file: ReleaseFile,
    target: string,
    control: OperationControl,
    progress: (bytes: number, received?: number) => void
  ): Promise<void> {
    const path = file.path.split("/").map(encodeURIComponent).join("/");

    await this._downloads.download(`${this.base(manifest.version)}/${path}`,
      file, target, control, progress);
  }

  private base(version: string): string {
    return `${this._bucket}/${validateVersion(version)}`
      + `/${this.platform}-${this.architecture}`;
  }

  private async text(response: Response, limit: number): Promise<string> {
    const chunks: Uint8Array[] = [];
    let size = 0;

    if (response.body === null) {
      throw new LauncherError("network");
    }

    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value: chunk } = await reader.read();

        if (done) {
          break;
        }

        size += chunk.byteLength;

        if (size > limit) {
          throw new LauncherError("manifest");
        }

        chunks.push(chunk);
      }
    }
    finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    return Buffer.concat(chunks).toString("utf8");
  }

  private async request(url: string, manifest = false): Promise<Response> {
    try {
      const response = await fetch(url, {
        cache: "no-store", signal: AbortSignal.timeout(15000)
      });

      if (manifest && response.status === 404) {
        await response.body?.cancel();

        throw new LauncherError("unsupported");
      }

      if (response.ok === false) {
        await response.body?.cancel();

        throw new LauncherError("network");
      }

      return response;
    }
    catch (error) {
      if (error instanceof LauncherError) {
        throw error;
      }

      throw new LauncherError("network");
    }
  }
}
