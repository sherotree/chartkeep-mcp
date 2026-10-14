import { StreamableHttpClient, toolJson, type ToolCallResult } from "../mcp/client";

export type TurnTool = {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
};

export type AgentTurn = {
  spoken: string;
  tools: TurnTool[];
  chart: Record<string, unknown> | null;
  insight: string | null;
};

const CHARTISH = /\b(chart|plot|graph|pie|bar|line|visual|show)\b/i;

export async function handleUtterance(client: StreamableHttpClient, raw: string): Promise<AgentTurn> {
  const question = raw.replace(/^\s*(alexa,?\s*)/i, "").trim();
  const tools: TurnTool[] = [];

  const ask = await call(client, tools, "ask_about_data", {
    question,
    includeChart: true,
  });
  const payload = asRecord(ask);
  const spoken = String(payload.answer ?? toolFallback(ask));
  let chart = extractChart(payload);
  let insight = typeof payload.insight === "string" ? payload.insight : null;
  if (payload.chart && typeof payload.chart === "object") {
    const c = payload.chart as Record<string, unknown>;
    insight = typeof c.insight === "string" ? c.insight : insight;
  }

  if (!chart && CHARTISH.test(question)) {
    const suggested = await call(client, tools, "suggest_chart", { question });
    chart = extractChart(asRecord(suggested));
  }

  return { spoken, tools, chart, insight };
}

async function call(
  client: StreamableHttpClient,
  tools: TurnTool[],
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result: ToolCallResult = await client.callTool(name, args);
  const parsed = safeJson(result);
  tools.push({ name, args, result: parsed });
  return parsed;
}

function safeJson(result: ToolCallResult): unknown {
  try {
    return toolJson(result);
  } catch {
    return result;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function extractChart(payload: Record<string, unknown>): Record<string, unknown> | null {
  const chart = payload.chart && typeof payload.chart === "object" ? (payload.chart as Record<string, unknown>) : payload;
  const option = chart.echartsOption;
  return option && typeof option === "object" ? (option as Record<string, unknown>) : null;
}

function toolFallback(value: unknown): string {
  return typeof value === "string" ? value : "I checked the table but could not form a spoken answer.";
}
