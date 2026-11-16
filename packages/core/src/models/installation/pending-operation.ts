import type { Manifest } from "../releases/manifest";
import type { Operation } from "./operation";

export interface PendingOperation {
  manifest: Manifest;
  operation: Operation;
}
