import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./csv.js";
import type { ParsedTable } from "./types.js";

const SAMPLE_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../samples/retail-sales.csv");

const store = new Map<string, ParsedTable>();

export function loadSampleTable(): ParsedTable {
  const csv = readFileSync(SAMPLE_PATH, "utf8");
  const table = parseCsv(csv, "retail-sales.csv");
  table.source = "sample";
  return table;
}

export function getTable(sessionId: string): ParsedTable {
  const existing = store.get(sessionId);
  if (existing) return existing;
  const table = loadSampleTable();
  store.set(sessionId, table);
  return table;
}

export function setTable(sessionId: string, table: ParsedTable): ParsedTable {
  store.set(sessionId, table);
  return table;
}

export function loadCsvText(sessionId: string, csv: string, name: string): ParsedTable {
  const table = parseCsv(csv, name);
  return setTable(sessionId, table);
}

export function resetToSample(sessionId: string): ParsedTable {
  return setTable(sessionId, loadSampleTable());
}

export function forgetSession(sessionId: string): void {
  store.delete(sessionId);
}

export function sampleCsvText(): string {
  return readFileSync(SAMPLE_PATH, "utf8");
}
