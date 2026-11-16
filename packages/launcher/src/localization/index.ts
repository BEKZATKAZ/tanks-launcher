import type { Language } from "@tanks/core";
import { parseCsv } from "./csv";
import source from "./strings.csv" with { type: "text" };

export const languages: { id: Language, name: string, flag: string }[] = [
  { id: "en", name: "English", flag: "gb" },
  { id: "ru", name: "Русский", flag: "ru" },
  { id: "fr", name: "Français", flag: "fr" }
];

const rows = parseCsv(source.replace(/^\uFEFF/, ""));
const columns = rows.shift()!;
const table = new Map(rows.map(row => [row[0], row]));

const languageColumns: Record<Language, number> = {
  en: columns.indexOf("English(en)"),
  ru: columns.indexOf("Russian(ru)"),
  fr: columns.indexOf("French(fr)")
};

export function text(language: Language, key: string): string {
  const row = table.get(key);

  return row?.[languageColumns[language]] || row?.[languageColumns.en] || key;
}
