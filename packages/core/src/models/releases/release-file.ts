export interface ReleaseFile {
  path: string;
  size: number;
  sha256: string;
  executable?: boolean;
}
