import type { ErrorCode } from "../models/launcher/error-code";

export class LauncherError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
