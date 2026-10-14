import { findColumn } from "./csv.js";
import { suggestChart } from "./chart.js";
import { computeFacts, factsBlock, findContradiction, fmt, templatedInsight } from "./facts.js";
import { defaultMeasure, queryFacts } from "./query.js";
import type { AggregateOp, ChartSuggestion, ParsedTable, QueryResult } from "./types.js";

export type AskResult = {
  answer: string;
  grounded: true;
  overrideReason: string | null;
  facts: string;
  query: QueryResult | null;
  chart: ChartSuggestion | null;
  intent: string;
};

const COLUMN_WORDS = /\b(columns?|schema|fields?|headers?|what.?s in)\b/i;
const CHART_WORDS = /\b(chart|plot|graph|visuali[sz]e|show me|draw|pie|bar|line)\b/i;
const GROWTH_WORDS = /\b(grew|grow|growth|fastest|increas\w*|rose|rising)\b/i;
const BEST_WORDS = /\b(best|top|highest|most|biggest|leading|lead)\b/i;
const WORST_WORDS = /\b(worst|lowest|least|smallest|bottom)\b/i;
const AVG_WORDS = /\b(average|avg|mean)\b/i;
const SUM_WORDS = /\b(total|sum|how much|revenue|sales)\b/i;
const COUNT_WORDS = /\b(how many|count|rows?)\b/i;

export function askAboutData(table: ParsedTable, question: string, includeChart = true): AskResult {
  const intent = classify(table, question);
  const facts = computeFacts(table);
  const factsText = facts ? factsBlock(facts) : "No numeric series to summarize.";
  let answer = "";
  let query: QueryResult | null = null;
  let chart: ChartSuggestion | null = null;

  if (intent.kind === "columns") {
    answer = table.columns
      .map((c) => `${c.name} (${c.kind}${c.samples.length ? `; e.g. ${c.samples.slice(0, 3).join(", ")}` : ""})`)
      .join(". ");
    answer = `${table.name} has ${table.columns.length} columns and ${table.rows.length} rows. ${answer}.`;
  } else if (intent.kind === "growth" && facts?.fastestGrowth) {
    answer = `${facts.fastestGrowth} grew fastest. ${templatedInsight(facts)}`;
    query = queryFacts(table, { op: "sum", measure: defaultMeasure(table), groupBy: guessGroup(table, question) });
    if (includeChart) chart = suggestChart(table, { question, type: "line", groupBy: guessGroup(table, question) });
  } else if (intent.kind === "aggregate") {
    query = queryFacts(table, {
      op: intent.op,
      measure: intent.measure,
      groupBy: intent.groupBy,
      filter: intent.filter,
    });
    answer = speakQuery(query, table);
    if (includeChart && (CHART_WORDS.test(question) || intent.groupBy)) {
      chart = suggestChart(table, {
        question,
        type: intent.groupBy && !/quarter|month|date/i.test(intent.groupBy) ? "bar" : "line",
        y: intent.measure,
        x: intent.groupBy && /quarter|month|date/i.test(intent.groupBy) ? intent.groupBy : undefined,
        groupBy: intent.groupBy && !/quarter|month|date/i.test(intent.groupBy) ? intent.groupBy : undefined,
      });
    }
  } else if (intent.kind === "chart") {
    chart = suggestChart(table, {
      question,
      type: intent.type,
      x: intent.x,
      y: intent.y,
      groupBy: intent.groupBy,
    });
    answer = chart.insight;
  } else {
    answer = facts ? templatedInsight(facts) : `${table.name}: ${table.rows.length} rows, ${table.columns.length} columns.`;
    if (includeChart) chart = suggestChart(table, { question });
  }

  const extraAllowed = [
    ...(query?.groups.map((g) => g.value) ?? []),
    query?.value ?? null,
    query?.top?.value ?? null,
    query?.bottom?.value ?? null,
    table.columns.length,
  ].filter((n): n is number => typeof n === "number");
  if (chart) {
    extraAllowed.push(
      ...(((chart.echartsOption as { series?: Array<{ data?: Array<number | { value?: number }> }> })?.series ?? [])
        .flatMap((s) => s.data ?? [])
        .map((d) => (typeof d === "number" ? d : d.value))
        .filter((n): n is number => typeof n === "number")),
    );
  }
  const overrideReason =
    facts && intent.kind !== "columns" && intent.kind !== "chart"
      ? findContradiction(answer, facts, table, extraAllowed)
      : null;
  if (overrideReason && facts && intent.kind !== "aggregate" && intent.kind !== "chart") {
    answer = templatedInsight(facts);
  }

  return {
    answer,
    grounded: true,
    overrideReason,
    facts: factsText,
    query,
    chart: includeChart ? chart : null,
    intent: intent.kind,
  };
}

type Intent =
  | { kind: "columns" }
  | { kind: "growth" }
  | { kind: "chart"; type?: ChartSuggestion["type"]; x?: string; y?: string; groupBy?: string }
  | {
      kind: "aggregate";
      op: AggregateOp;
      measure?: string;
      groupBy?: string;
      filter?: { column: string; equals: string };
    }
  | { kind: "summary" };

function classify(table: ParsedTable, question: string): Intent {
  if (COLUMN_WORDS.test(question)) return { kind: "columns" };
  if (GROWTH_WORDS.test(question)) return { kind: "growth" };

  const measure = namedColumn(table, question, "number") ?? defaultMeasure(table);
  const group = namedColumn(table, question, "category") ?? namedColumn(table, question, "date");
  const filter = namedValue(table, question);

  if (CHART_WORDS.test(question)) {
    const type = /\bpie\b/i.test(question)
      ? "pie"
      : /\barea\b/i.test(question)
        ? "area"
        : /\bbar\b/i.test(question)
          ? "bar"
          : /\bline\b/i.test(question)
            ? "line"
            : undefined;
    return { kind: "chart", type, x: group, y: measure, groupBy: group };
  }

  if (BEST_WORDS.test(question) || WORST_WORDS.test(question) || AVG_WORDS.test(question) || SUM_WORDS.test(question) || COUNT_WORDS.test(question) || filter || group) {
    const op: AggregateOp = COUNT_WORDS.test(question)
      ? "count"
      : AVG_WORDS.test(question)
        ? "avg"
        : WORST_WORDS.test(question)
          ? "min"
          : BEST_WORDS.test(question)
            ? "max"
            : "sum";
    const groupBy =
      BEST_WORDS.test(question) || WORST_WORDS.test(question)
        ? group ?? table.columns.find((c) => c.kind === "category")?.name
        : group;
    return { kind: "aggregate", op: BEST_WORDS.test(question) || WORST_WORDS.test(question) ? "sum" : op, measure, groupBy, filter };
  }

  return { kind: "summary" };
}

function namedColumn(table: ParsedTable, question: string, kind?: ParsedTable["columns"][number]["kind"]) {
  const q = question.toLowerCase();
  return table.columns.find((c) => (!kind || c.kind === kind) && q.includes(c.name.toLowerCase()))?.name;
}

function namedValue(table: ParsedTable, question: string): { column: string; equals: string } | undefined {
  const q = question.toLowerCase();
  for (const col of table.columns.filter((c) => c.kind === "category" || c.kind === "date")) {
    const values = new Set(table.rows.map((row) => String(row[col.name] ?? "")));
    for (const value of values) {
      if (value && q.includes(value.toLowerCase())) return { column: col.name, equals: value };
    }
  }
  return undefined;
}

function guessGroup(table: ParsedTable, question: string): string | undefined {
  return (
    namedColumn(table, question, "category") ??
    table.columns.find((c) => /product|item|sku/i.test(c.name))?.name ??
    table.columns.find((c) => c.kind === "category")?.name
  );
}

function speakQuery(query: QueryResult, table: ParsedTable): string {
  const measure = query.measure ?? "rows";
  if (query.groups.length > 0) {
    const top = query.top;
    const bottom = query.bottom;
    if (top && bottom && top.key !== bottom.key) {
      return `${top.key} is the highest ${measure} at ${fmt(top.value)}. ${bottom.key} is the lowest at ${fmt(bottom.value)}. Computed from ${query.rowCount} rows in ${table.name}.`;
    }
    if (top) return `${top.key}: ${fmt(top.value)} ${measure}.`;
  }
  if (query.value !== null) {
    const filter = query.filter ? ` for ${query.filter.equals}` : "";
    return `${query.op} of ${measure}${filter} is ${fmt(query.value)} (${query.rowCount} rows).`;
  }
  return `No ${measure} values matched.`;
}

export function resolveColumn(table: ParsedTable, name: string) {
  return findColumn(table, name);
}
