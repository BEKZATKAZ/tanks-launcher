export interface ClockService {
  now(): number;
  every(milliseconds: number, callback: () => void): () => void;
}
