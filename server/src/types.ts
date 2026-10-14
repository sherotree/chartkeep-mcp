export type ColumnKind = "number" | "date" | "category";

export type Column = {
  name: string;
  kind: ColumnKind;
  samples: string[];
  nulls: number;
};

export type Row = Record<string, string | number | null>;

export type ParsedTable = {
  name: string;
  source: "sample" | "upload";
  columns: Column[];
  rows: Row[];
};

export type AggregateOp = "sum" | "avg" | "min" | "max" | "count";

export type QueryRequest = {
  measure?: string;
  op: AggregateOp;
  groupBy?: string;
  filter?: { column: string; equals: string };
};

export type QueryResult = {
  op: AggregateOp;
  measure: string | null;
  groupBy: string | null;
  filter: { column: string; equals: string } | null;
  value: number | null;
  groups: { key: string; value: number }[];
  top: { key: string; value: number } | null;
  bottom: { key: string; value: number } | null;
  rowCount: number;
};

export type SeriesFacts = {
  name: string;
  first: number;
  firstLabel: string;
  last: number;
  lastLabel: string;
  min: number;
  minLabel: string;
  max: number;
  maxLabel: string;
  change: number;
  pctChange: number | null;
};

export type TableFacts = {
  x: string;
  xKind: ColumnKind;
  series: SeriesFacts[];
  fastestGrowth: string | null;
  bestPeriod: { label: string; value: number } | null;
  worstPeriod: { label: string; value: number } | null;
};

export type ChartType = "bar" | "line" | "pie" | "area" | "grouped-bar";

export type ChartSuggestion = {
  type: ChartType;
  title: string;
  insight: string;
  echartsOption: Record<string, unknown>;
  factsChecked: true;
};
