import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { askAboutData } from "./ask.js";
import { parseCsv } from "./csv.js";
import { computeFacts } from "./facts.js";
import { queryFacts } from "./query.js";

const sample = parseCsv(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../samples/retail-sales.csv"), "utf8"),
  "retail-sales.csv",
);

describe("csv + facts", () => {
  it("parses the sample as 36 rows with mixed kinds", () => {
    assert.equal(sample.rows.length, 36);
    assert.equal(sample.columns.find((c) => c.name === "revenue")?.kind, "number");
    assert.equal(sample.columns.find((c) => c.name === "quarter")?.kind, "date");
    assert.equal(sample.columns.find((c) => c.name === "region")?.kind, "category");
  });

  it("computes West as largest region and Butter Croissant as fastest growth", () => {
    const west = queryFacts(sample, { op: "sum", measure: "revenue", groupBy: "region" });
    assert.equal(west.top?.key, "West");
    const facts = computeFacts(sample);
    assert.equal(facts?.fastestGrowth, "Butter Croissant");
    assert.equal(facts?.bestPeriod?.label, "2025-Q4");
  });
});

describe("ask_about_data", () => {
  it("answers best-selling region from computed aggregates", () => {
    const result = askAboutData(sample, "what's our best-selling region?", false);
    assert.match(result.answer, /West/i);
    assert.equal(result.grounded, true);
    assert.equal(result.overrideReason, null);
  });

  it("names Butter Croissant as fastest growth", () => {
    const result = askAboutData(sample, "which product grew fastest?", false);
    assert.match(result.answer, /Butter Croissant/);
  });

  it("lists columns when asked for schema", () => {
    const result = askAboutData(sample, "what columns are in this spreadsheet?", false);
    assert.match(result.answer, /quarter/);
    assert.match(result.answer, /revenue/);
  });

  it("returns an ECharts pie spec for a pie request", () => {
    const result = askAboutData(sample, "show a pie of revenue by region", true);
    assert.ok(result.chart);
    assert.equal(result.chart?.type, "pie");
    assert.equal(result.chart?.factsChecked, true);
    assert.match(result.answer, /West/i);
    assert.equal(result.intent, "chart");
  });

  it("names the peak quarter when asked for a revenue chart", () => {
    const result = askAboutData(sample, "chart quarterly revenue", true);
    assert.match(result.answer, /2025-Q4/);
    assert.ok(result.chart);
  });
});
