import type { Phase } from "../installation/phase";
import type { ErrorCode } from "./error-code";
import type { Language } from "./language";

export interface Snapshot {
  revision: number;
  operationId: number;
  releaseOperation?: { id: number, version: string };
  language: Language;
  destination?: string;
  defaultDestination: string;
  installed?: { version: string };
  targetVersion?: string;
  running: boolean;
  phase: Phase;
  paused: boolean;
  pending: boolean;
  progress: number | null;
  downloadBytesPerSecond?: number;
  totalBytes?: number;
  error?: ErrorCode;
  missingDestination: boolean;
}
