import type { Manifest } from "@tanks/core";
import type { TransactionEntry } from "./transaction-entry";

export interface Transaction {
  committed: boolean;
  previous?: Manifest;
  target: Manifest;
  entries: TransactionEntry[];
}
