import { asNumber } from "./csv.js";
import type { ParsedTable, SeriesFacts, TableFacts } from "./types.js";

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function fmt(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return round(value, 2).toLocaleString("en-US");
}

export function computeFacts(table: ParsedTable): TableFacts | null {
  const numeric = table.columns.filter((c) => c.kind === "number");
  const xCol =
    table.columns.find((c) => c.kind === "date") ??
    table.columns.find((c) => c.kind !== "number") ??
    table.columns[0];
  if (!xCol || table.rows.length === 0) return null;
  const ys = numeric.filter((c) => c.name !== xCol.name);
  if (ys.length === 0) return null;

  const labels = uniqueLabels(table, xCol.name);
  const series: SeriesFacts[] = [];
  for (const col of ys) {
    const points = labels
      .map((label) => ({
        label,
        v: sumWhere(table, xCol.name, label, col.name),
      }))
      .filter((p) => p.v !== null) as { label: string; v: number }[];
    if (points.length === 0) continue;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    let min = first;
    let max = first;
    for (const p of points) {
      if (p.v < min.v) min = p;
      if (p.v > max.v) max = p;
    }
    const change = last.v - first.v;
    series.push({
      name: col.name,
      first: first.v,
      firstLabel: first.label,
      last: last.v,
      lastLabel: last.label,
      min: min.v,
      minLabel: min.label,
      max: max.v,
      maxLabel: max.label,
      change,
      pctChange: first.v !== 0 ? (change / Math.abs(first.v)) * 100 : null,
    });
  }
  if (series.length === 0) return null;

  const categoryCols = table.columns.filter((c) => c.kind === "category" && c.name !== xCol.name);
  let fastestGrowth: string | null = null;
  if (categoryCols.length > 0) {
    const growth = categoryCols.flatMap((cat) =>
      uniqueLabels(table, cat.name)
        .map((name) => growthForGroup(table, xCol.name, cat.name, name, ys[0]!.name))
        .filter((g): g is NonNullable<typeof g> => g !== null),
    );
    if (growth.length > 0) {
      const best = growth.reduce((a, b) => (b.score > a.score ? b : a));
      fastestGrowth = best.score > 0 ? best.name : null;
    }
  } else if (series.length > 1) {
    const usePct = series.every((s) => s.pctChange !== null);
    const score = (s: SeriesFacts) => (usePct ? (s.pctChange as number) : s.change);
    const best = series.reduce((a, b) => (score(b) > score(a) ? b : a));
    fastestGrowth = score(best) > 0 ? best.name : null;
  }

  const totals = labels.map((label) => ({
    label,
    value: ys.reduce((sum, col) => sum + (sumWhere(table, xCol.name, label, col.name) ?? 0), 0),
  }));
  const bestPeriod = totals.reduce((a, b) => (b.value > a.value ? b : a));
  const worstPeriod = totals.reduce((a, b) => (b.value < a.value ? b : a));

  return { x: xCol.name, xKind: xCol.kind, series, fastestGrowth, bestPeriod, worstPeriod };
}

function uniqueLabels(table: ParsedTable, column: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of table.rows) {
    const label = String(row[column] ?? "");
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

function sumWhere(table: ParsedTable, labelCol: string, label: string, measure: string): number | null {
  let total = 0;
  let any = false;
  for (const row of table.rows) {
    if (String(row[labelCol] ?? "") !== label) continue;
    const n = asNumber(row[measure]);
    if (n === null) continue;
    total += n;
    any = true;
  }
  return any ? total : null;
}

function growthForGroup(
  table: ParsedTable,
  xCol: string,
  groupCol: string,
  group: string,
  measure: string,
): { name: string; score: number } | null {
  const labels = uniqueLabels(table, xCol);
  const points = labels
    .map((label) => {
      let total = 0;
      let any = false;
      for (const row of table.rows) {
        if (String(row[xCol] ?? "") !== label) continue;
        if (String(row[groupCol] ?? "") !== group) continue;
        const n = asNumber(row[measure]);
        if (n === null) continue;
        total += n;
        any = true;
      }
      return any ? total : null;
    })
    .filter((v): v is number => v !== null);
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const change = last - first;
  const score = first !== 0 ? (change / Math.abs(first)) * 100 : change;
  return { name: group, score };
}

export function factsBlock(facts: TableFacts): string {
  const lines = facts.series.map((s) => {
    const pct =
      s.pctChange === null ? "" : ` (${s.pctChange >= 0 ? "+" : ""}${round(s.pctChange)}%)`;
    return `- ${s.name}: ${s.firstLabel}=${fmt(s.first)} → ${s.lastLabel}=${fmt(s.last)}, change ${s.change >= 0 ? "+" : ""}${fmt(s.change)}${pct}, max ${fmt(s.max)} at ${s.maxLabel}, min ${fmt(s.min)} at ${s.minLabel}`;
  });
  if (facts.fastestGrowth) lines.push(`- Fastest growth: ${facts.fastestGrowth}`);
  if (facts.bestPeriod && facts.worstPeriod) {
    const what = facts.series.length > 1 ? "total" : facts.series[0]!.name;
    lines.push(`- Best ${facts.x}: ${facts.bestPeriod.label} (${what} ${fmt(facts.bestPeriod.value)})`);
    lines.push(`- Worst ${facts.x}: ${facts.worstPeriod.label} (${what} ${fmt(facts.worstPeriod.value)})`);
  }
  return lines.join("\n");
}

export function templatedInsight(facts: TableFacts): string {
  if (facts.fastestGrowth) {
    return `${facts.fastestGrowth} grew fastest. Best ${facts.x} overall: ${facts.bestPeriod?.label ?? "n/a"}.`;
  }
  const s = facts.series[0];
  if (!s) return "No numeric series to summarize.";
  return `${s.maxLabel} is the peak at ${fmt(s.max)}; ${s.minLabel} is the low at ${fmt(s.min)}.`;
}

export function numbersInText(text: string): number[] {
  const out: number[] = [];
  const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  for (const match of text.matchAll(re)) {
    const n = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function findContradiction(
  insight: string,
  facts: TableFacts,
  table: ParsedTable,
  extraAllowed: number[] = [],
): string | null {
  const allowed: number[] = [table.rows.length, table.columns.length, facts.series.length, ...extraAllowed];
  for (const row of table.rows) {
    for (const v of Object.values(row)) {
      if (typeof v === "number") allowed.push(v);
    }
  }
  for (const s of facts.series) {
    allowed.push(s.first, s.last, s.min, s.max, s.change, Math.abs(s.change));
    if (s.pctChange !== null) allowed.push(s.pctChange, Math.abs(s.pctChange), round(s.pctChange));
  }
  if (facts.bestPeriod) allowed.push(facts.bestPeriod.value);
  if (facts.worstPeriod) allowed.push(facts.worstPeriod.value);

  for (const n of numbersInText(insight)) {
    const ok = allowed.some((a) => {
      const tol = Math.max(Math.abs(a) * 0.02, 0.6);
      return Math.abs(a - n) <= tol;
    });
    if (!ok) return `answer cites ${n}, which is not in the table or computed stats`;
  }
  return null;
}
