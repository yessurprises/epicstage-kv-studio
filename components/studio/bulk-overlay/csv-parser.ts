// Phase F — minimal CSV parser. Handles quoted fields ("Hong, John"),
// embedded quotes ("He said ""hi"""), CRLF/LF, BOM. Korean UTF-8 is handled
// by the File API decode upstream — this layer is text-in / rows-out.
//
// Whitespace policy: unquoted fields are trimmed (operators frequently leave
// stray spaces around comma-separated values pasted from Excel). Quoted fields
// are preserved byte-for-byte — if someone wrote `"  spacey  "` they meant
// the spaces, e.g. for fixed-width name padding on badges.
//
// Why hand-roll: papaparse pulls in 50KB+ for one feature. The shape of CSVs
// we accept is tightly controlled (Excel/Sheets export of a name list).

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
  errors: string[];
}

interface ParsedCell {
  value: string;
  /** True if the cell was wrapped in double quotes. */
  quoted: boolean;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function normalize(cell: ParsedCell): string {
  return cell.quoted ? cell.value : cell.value.trim();
}

export function parseCsv(text: string): ParsedCsv {
  const src = stripBom(text);
  const rows: ParsedCell[][] = [];
  let cur: ParsedCell[] = [];
  let field = "";
  let inQuote = false;
  let cellWasQuoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuote) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuote = true;
      cellWasQuoted = true;
    } else if (c === ",") {
      cur.push({ value: field, quoted: cellWasQuoted });
      field = "";
      cellWasQuoted = false;
    } else if (c === "\n") {
      cur.push({ value: field, quoted: cellWasQuoted });
      rows.push(cur);
      cur = [];
      field = "";
      cellWasQuoted = false;
    } else if (c === "\r") {
      // ignore — handled by following \n if present
    } else {
      field += c;
    }
  }
  // flush trailing field
  if (field.length > 0 || cur.length > 0 || cellWasQuoted) {
    cur.push({ value: field, quoted: cellWasQuoted });
    rows.push(cur);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], errors: ["CSV가 비어 있습니다"] };
  }

  // Headers are always trimmed regardless of quoting — column keys with
  // padding spaces would break the schema lookup downstream.
  const headers = rows[0].map((h) => h.value.trim());
  const errors: string[] = [];
  const out: Array<Record<string, string>> = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((cell) => cell.value.trim() === "")) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      const cell = row[i] ?? { value: "", quoted: false };
      record[h] = normalize(cell);
    });
    out.push(record);
  }

  return { headers, rows: out, errors };
}

export function validateRows(
  rows: Array<Record<string, string>>,
  schema: Array<{ key: string; required?: boolean }>,
): string[] {
  const errors: string[] = [];
  rows.forEach((row, idx) => {
    schema.forEach((col) => {
      if (col.required && !row[col.key]?.trim()) {
        errors.push(`${idx + 1}행: 필수 컬럼 "${col.key}"가 비어 있습니다`);
      }
    });
  });
  return errors;
}
