export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index++) {
    const character = source[index];

    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index++;
      }
      else {
        quoted = quoted === false;
      }

      continue;
    }

    if (quoted === false && (character === "," || character === "\n")) {
      row.push(field.replace(/\r$/, ""));
      field = "";

      if (character === "\n") {
        rows.push(row);
        row = [];
      }

      continue;
    }

    field += character;
  }

  if (quoted) {
    throw new Error("Unclosed CSV field");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}
