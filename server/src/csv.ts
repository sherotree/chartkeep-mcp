import type { Column, ColumnKind, ParsedTable, Row } from "./types.js";

const NUMBER_RE = /^-?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?$|^-?\$?\d+(?:\.\d+)?%?$/;
const DATE_RE = /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$|^\d{4}-Q[1-4]$/i;

export function parseCsv(text: string, name = "uploaded.csv"): ParsedTable {
  const rows = splitCsv(text);
  if (rows.length === 0) {
    throw new Error("CSV is empty");
  }
  const headers = rows[0]!.map((h, i) => (h.trim() || `column_${i + 1}`));
  const body = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));
  const objects: Row[] = body.map((cells) => {
    const row: Row = {};
    headers.forEach((header, i) => {
      row[header] = coerce(cells[i] ?? "");
    });
    return row;
  });
  const columns = headers.map((header) => inferColumn(header, objects));
  return { name, source: "upload", columns, rows: objects };
}

export function splitCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.length > 0));
}

function coerce(raw: string): string | number | null {
  const value = raw.trim();
  if (value === "") return null;
  const cleaned = value.replace(/[$,]/g, "");
  if (NUMBER_RE.test(value)) {
    const n = Number(cleaned.replace(/%$/, ""));
    if (Number.isFinite(n)) return n;
  }
  return value;
}

function inferColumn(name: string, rows: Row[]): Column {
  const values = rows.map((row) => row[name]);
  const nulls = values.filter((v) => v === null || v === "").length;
  const present = values.filter((v) => v !== null && v !== "");
  const samples = [...new Set(present.map((v) => String(v)))].slice(0, 6);
  return { name, kind: inferKind(present), samples, nulls };
}

function inferKind(values: Array<string | number | null>): ColumnKind {
  if (values.length === 0) return "category";
  const numeric = values.filter((v) => typeof v === "number").length;
  if (numeric / values.length >= 0.8) return "number";
  const dateish = values.filter((v) => typeof v === "string" && DATE_RE.test(v)).length;
  if (dateish / values.length >= 0.6) return "date";
  return "category";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function findColumn(table: ParsedTable, name: string | undefined): Column | undefined {
  if (!name) return undefined;
  const needle = name.trim().toLowerCase();
  return (
    table.columns.find((c) => c.name.toLowerCase() === needle) ??
    table.columns.find((c) => c.name.toLowerCase().replace(/[_\s-]+/g, "") === needle.replace(/[_\s-]+/g, ""))
  );
}
