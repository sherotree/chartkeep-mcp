import { asNumber, findColumn } from "./csv.js";
import { computeFacts, factsBlock, fmt, templatedInsight } from "./facts.js";
import { defaultMeasure, queryFacts } from "./query.js";
import type { ChartSuggestion, ChartType, ParsedTable } from "./types.js";

const PALETTE = ["#c45c26", "#2a7a6e", "#e8a13a", "#3d4f6f", "#8c4a3a", "#6b8f71"];

export function suggestChart(
  table: ParsedTable,
  options: { question?: string; type?: ChartType; x?: string; y?: string; groupBy?: string } = {},
): ChartSuggestion {
  const question = options.question ?? "";
  const measure = findColumn(table, options.y)?.name ?? defaultMeasure(table);
  const x =
    findColumn(table, options.x)?.name ??
    table.columns.find((c) => c.kind === "date")?.name ??
    table.columns.find((c) => c.kind === "category")?.name ??
    table.columns[0]?.name;
  if (!measure || !x) {
    throw new Error("Need at least one category/date column and one numeric column");
  }

  const type = options.type ?? inferType(table, question, x);
  const groupBy =
    findColumn(table, options.groupBy)?.name ??
    (type === "grouped-bar" || /\bby\b/i.test(question)
      ? pickGroup(table, x, question)
      : type === "pie"
        ? pickGroup(table, x, question) ?? x
        : undefined);

  if (type === "pie") {
    const dim = groupBy ?? x;
    const result = queryFacts(table, { op: "sum", measure, groupBy: dim });
    const insight = result.top
      ? `${result.top.key} leads ${measure} at ${fmt(result.top.value)}.`
      : templatedInsight(computeFacts(table) ?? { x, xKind: "category", series: [], fastestGrowth: null, bestPeriod: null, worstPeriod: null });
    return {
      type,
      title: `${measure} by ${dim}`,
      insight,
      factsChecked: true,
      echartsOption: pieOption(`${measure} by ${dim}`, result.groups),
    };
  }

  if (groupBy && groupBy !== x) {
    const seriesNames = unique(table, groupBy);
    const cats = unique(table, x);
    const series = seriesNames.map((name, i) => ({
      name,
      type: type === "area" ? "line" : type === "grouped-bar" ? "bar" : type === "line" ? "line" : "bar",
      stack: type === "area" ? "total" : undefined,
      areaStyle: type === "area" ? { opacity: 0.18 } : undefined,
      itemStyle: { color: PALETTE[i % PALETTE.length] },
      data: cats.map((cat) =>
        table.rows
          .filter((row) => String(row[x]) === cat && String(row[groupBy]) === name)
          .reduce((sum, row) => sum + (asNumber(row[measure]) ?? 0), 0),
      ),
    }));
    const facts = computeFacts(table);
    const insight = facts ? templatedInsight(facts) : `${measure} grouped by ${groupBy}.`;
    return {
      type: type === "line" || type === "area" ? type : "grouped-bar",
      title: `${measure} by ${x} and ${groupBy}`,
      insight,
      factsChecked: true,
      echartsOption: cartesianOption(`${measure} by ${x}`, cats, series),
    };
  }

  const cats = unique(table, x);
  const data = cats.map((cat) =>
    table.rows.filter((row) => String(row[x]) === cat).reduce((sum, row) => sum + (asNumber(row[measure]) ?? 0), 0),
  );
  const facts = computeFacts(table);
  const peak = facts?.bestPeriod;
  const insight = peak
    ? `${peak.label} is the peak ${measure} at ${fmt(peak.value)}.`
    : facts
      ? templatedInsight(facts)
      : `${measure} by ${x}.`;
  return {
    type,
    title: `${measure} by ${x}`,
    insight,
    factsChecked: true,
    echartsOption: cartesianOption(`${measure} by ${x}`, cats, [
      {
        name: measure,
        type: type === "area" ? "line" : type,
        areaStyle: type === "area" ? { opacity: 0.18 } : undefined,
        itemStyle: { color: PALETTE[0] },
        data,
      },
    ]),
  };
}

function inferType(table: ParsedTable, question: string, x: string): ChartType {
  if (/\bpie|share|portion|breakdown\b/i.test(question)) return "pie";
  if (/\barea\b/i.test(question)) return "area";
  if (/\bbar|compare|versus|vs\b/i.test(question)) return /\bby\b/i.test(question) ? "grouped-bar" : "bar";
  const xCol = table.columns.find((c) => c.name === x);
  if (xCol?.kind === "date" || /quarter|month|date|year|week/i.test(x)) return "line";
  if (/\bchart|plot|graph|show|visual/i.test(question) && xCol?.kind === "category") return "bar";
  return "bar";
}

function pickGroup(table: ParsedTable, x: string, question: string): string | undefined {
  const cats = table.columns.filter((c) => c.kind === "category" && c.name !== x);
  const mentioned = cats.find((c) => question.toLowerCase().includes(c.name.toLowerCase()));
  return mentioned?.name ?? cats[0]?.name;
}

function unique(table: ParsedTable, column: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of table.rows) {
    const key = String(row[column] ?? "");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function pieOption(title: string, groups: { key: string; value: number }[]): Record<string, unknown> {
  return {
    backgroundColor: "transparent",
    color: PALETTE,
    title: { text: title, left: "center", textStyle: { color: "#2c2416", fontFamily: "Cormorant Garamond", fontSize: 18 } },
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["36%", "68%"],
        itemStyle: { borderColor: "#f3ead8", borderWidth: 2 },
        label: { color: "#2c2416" },
        data: groups.map((g) => ({ name: g.key, value: g.value })),
      },
    ],
  };
}

function cartesianOption(
  title: string,
  categories: string[],
  series: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    backgroundColor: "transparent",
    color: PALETTE,
    title: { text: title, left: 8, textStyle: { color: "#2c2416", fontFamily: "Cormorant Garamond", fontSize: 18 } },
    tooltip: { trigger: "axis" },
    legend: { top: 0, right: 8, textStyle: { color: "#2c2416" } },
    grid: { left: 48, right: 16, top: 48, bottom: 36 },
    xAxis: { type: "category", data: categories, axisLabel: { color: "#5c5346" } },
    yAxis: { type: "value", axisLabel: { color: "#5c5346" }, splitLine: { lineStyle: { color: "#e4d8c4" } } },
    series,
  };
}

export function chartWithFactsNote(suggestion: ChartSuggestion, table: ParsedTable): ChartSuggestion {
  const facts = computeFacts(table);
  if (!facts) return suggestion;
  return {
    ...suggestion,
    insight: `${suggestion.insight} Facts checked against the table (${facts.series.length} series).`,
    echartsOption: {
      ...suggestion.echartsOption,
      _chartkeep: { facts: factsBlock(facts) },
    },
  };
}
