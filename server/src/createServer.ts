import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { askAboutData } from "./ask.js";
import { suggestChart } from "./chart.js";
import { getTable, loadCsvText, resetToSample } from "./dataset.js";
import { computeFacts, factsBlock } from "./facts.js";
import { queryFacts } from "./query.js";

const PROTOCOL = "2025-11-25";

function sessionOf(extra: { sessionId?: string }): string {
  return extra.sessionId ?? "anonymous";
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

export function createChartKeepServer() {
  const server = new McpServer(
    {
      name: "chartkeep",
      version: "0.1.0",
      title: "ChartKeep",
    },
    {
      capabilities: {
        logging: {},
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions:
        "ChartKeep answers questions about a user-uploaded CSV. Compute facts from the table first. Never invent numbers. Prefer list_columns, query_facts, suggest_chart, and ask_about_data. Protocol " +
        PROTOCOL +
        ".",
    },
  );

  server.registerTool(
    "load_dataset",
    {
      title: "Load dataset",
      description:
        "Load the bundled retail-sales sample or replace the session table with CSV text. Call this before asking questions about a new file.",
      inputSchema: {
        source: z.enum(["sample", "csv"]).describe("sample uses samples/retail-sales.csv; csv uses the csv argument"),
        csv: z.string().optional().describe("Raw CSV text when source is csv"),
        name: z.string().optional().describe("File name to remember"),
      },
    },
    async ({ source, csv, name }, extra) => {
      try {
        const sessionId = sessionOf(extra);
        const table =
          source === "sample"
            ? resetToSample(sessionId)
            : loadCsvText(sessionId, csv ?? "", name ?? "upload.csv");
        return jsonResult({
          name: table.name,
          source: table.source,
          rows: table.rows.length,
          columns: table.columns.map((c) => c.name),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Failed to load dataset");
      }
    },
  );

  server.registerTool(
    "list_columns",
    {
      title: "List columns",
      description: "Describe columns in the current session table: name, inferred kind, sample values, null count.",
      inputSchema: {
        unused: z.string().optional().describe("Ignored. Present so clients can call the tool with an empty object."),
      },
    },
    async (_args, extra) => {
      const table = getTable(sessionOf(extra));
      return jsonResult({
        dataset: table.name,
        source: table.source,
        rowCount: table.rows.length,
        columns: table.columns,
      });
    },
  );

  server.registerTool(
    "query_facts",
    {
      title: "Query facts",
      description:
        "Compute a grounded aggregate (sum, avg, min, max, count). Optional groupBy and a single equals filter. All numbers come from the table.",
      inputSchema: {
        op: z.enum(["sum", "avg", "min", "max", "count"]).describe("Aggregate to compute"),
        measure: z.string().optional().describe("Numeric column. Defaults to revenue/sales or the first number column."),
        groupBy: z.string().optional().describe("Category or date column to split by"),
        filterColumn: z.string().optional().describe("Column to filter"),
        filterEquals: z.string().optional().describe("Exact value to keep, case-insensitive"),
      },
    },
    async ({ op, measure, groupBy, filterColumn, filterEquals }, extra) => {
      try {
        const table = getTable(sessionOf(extra));
        const filter =
          filterColumn && filterEquals ? { column: filterColumn, equals: filterEquals } : undefined;
        const result = queryFacts(table, { op, measure, groupBy, filter });
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Query failed");
      }
    },
  );

  server.registerTool(
    "suggest_chart",
    {
      title: "Suggest chart",
      description:
        "Return an ECharts option JSON plus a one-sentence insight grounded in computed facts. The simulator renders the option as-is.",
      inputSchema: {
        question: z.string().optional().describe("Voice-style request, e.g. chart quarterly revenue"),
        type: z.enum(["bar", "line", "pie", "area", "grouped-bar"]).optional(),
        x: z.string().optional().describe("Category or date axis"),
        y: z.string().optional().describe("Numeric measure"),
        groupBy: z.string().optional().describe("Split series by this column"),
      },
    },
    async ({ question, type, x, y, groupBy }, extra) => {
      try {
        const table = getTable(sessionOf(extra));
        const chart = suggestChart(table, { question, type, x, y, groupBy });
        const facts = computeFacts(table);
        return jsonResult({
          ...chart,
          facts: facts ? factsBlock(facts) : null,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Chart suggestion failed");
      }
    },
  );

  server.registerTool(
    "ask_about_data",
    {
      title: "Ask about data",
      description:
        "Natural-language Q&A over the current table. Computes facts first, then answers. Will not emit a number that is not in the table or the stats. Optionally returns an ECharts spec.",
      inputSchema: {
        question: z.string().describe("What a person would say to Alexa, without the wake word"),
        includeChart: z
          .boolean()
          .optional()
          .describe("When true (default), also return a chart spec if the question implies one"),
      },
    },
    async ({ question, includeChart }, extra) => {
      try {
        const table = getTable(sessionOf(extra));
        const result = askAboutData(table, question, includeChart ?? true);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Ask failed");
      }
    },
  );

  server.registerResource(
    "current-dataset",
    "dataset://current",
    {
      title: "Current dataset",
      description: "Name, source, columns, and a 5-row preview of the session table.",
      mimeType: "application/json",
    },
    async (uri, extra) => {
      const table = getTable(sessionOf(extra));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                name: table.name,
                source: table.source,
                columns: table.columns,
                preview: table.rows.slice(0, 5),
                rowCount: table.rows.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "voice-sales-brief",
    {
      title: "Voice sales brief",
      description: "Spoken brief of the current table, suitable for an Alexa+ reply.",
      argsSchema: {
        focus: z.string().optional().describe("Optional focus such as region or product"),
      },
    },
    ({ focus }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Ask ChartKeep for a grounded spoken brief${focus ? ` focused on ${focus}` : ""}. Use ask_about_data, then suggest_chart if a visual would help. Do not invent numbers.`,
          },
        },
      ],
    }),
  );

  return server;
}
