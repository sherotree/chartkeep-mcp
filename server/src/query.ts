import { asNumber, findColumn } from "./csv.js";
import type { AggregateOp, ParsedTable, QueryRequest, QueryResult, Row } from "./types.js";

function reduce(values: number[], op: AggregateOp): number {
  if (op === "count") return values.length;
  if (values.length === 0) return 0;
  if (op === "sum") return values.reduce((a, b) => a + b, 0);
  if (op === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  if (op === "min") return Math.min(...values);
  return Math.max(...values);
}

function matchesFilter(row: Row, filter?: QueryRequest["filter"]): boolean {
  if (!filter) return true;
  return String(row[filter.column] ?? "").toLowerCase() === filter.equals.toLowerCase();
}

export function queryFacts(table: ParsedTable, request: QueryRequest): QueryResult {
  const measureCol = findColumn(table, request.measure) ?? table.columns.find((c) => c.kind === "number");
  const groupCol = findColumn(table, request.groupBy);
  const filterCol = request.filter ? findColumn(table, request.filter.column) : undefined;
  const filter = filterCol && request.filter ? { column: filterCol.name, equals: request.filter.equals } : null;

  const rows = table.rows.filter((row) => matchesFilter(row, filter ?? undefined));
  const measure = measureCol?.name ?? null;

  if (groupCol) {
    const buckets = new Map<string, number[]>();
    for (const row of rows) {
      const key = String(row[groupCol.name] ?? "");
      if (!buckets.has(key)) buckets.set(key, []);
      if (request.op === "count") {
        buckets.get(key)!.push(1);
      } else if (measure) {
        const n = asNumber(row[measure]);
        if (n !== null) buckets.get(key)!.push(n);
      }
    }
    const groups = [...buckets.entries()]
      .map(([key, values]) => ({ key, value: reduce(values, request.op) }))
      .sort((a, b) => b.value - a.value);
    return {
      op: request.op,
      measure,
      groupBy: groupCol.name,
      filter,
      value: null,
      groups,
      top: groups[0] ?? null,
      bottom: groups[groups.length - 1] ?? null,
      rowCount: rows.length,
    };
  }

  const values =
    request.op === "count"
      ? rows.map(() => 1)
      : measure
        ? rows.map((row) => asNumber(row[measure])).filter((n): n is number => n !== null)
        : [];

  return {
    op: request.op,
    measure,
    groupBy: null,
    filter,
    value: values.length ? reduce(values, request.op) : 0,
    groups: [],
    top: null,
    bottom: null,
    rowCount: rows.length,
  };
}

export function defaultMeasure(table: ParsedTable): string | undefined {
  return (
    table.columns.find((c) => /revenue|sales|amount|total/i.test(c.name) && c.kind === "number")?.name ??
    table.columns.find((c) => c.kind === "number")?.name
  );
}
