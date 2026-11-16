export interface ProcessRecord {
  pid: number;
  parent: number;
  path: string;
  identity: string;
}
