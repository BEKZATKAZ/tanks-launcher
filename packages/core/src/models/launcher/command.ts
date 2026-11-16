import type { Language } from "./language";

export type Command =
  | { type: "install", destination?: string }
  | { type: "language", language: Language }
  | { type: "resume" | "pause" | "verify" | "play" | "stop"
    | "browse" | "uninstall" | "check"; };
