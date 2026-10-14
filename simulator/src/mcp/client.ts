export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type WireEvent = {
  id: string;
  at: number;
  direction: "out" | "in";
  method?: string;
  status?: number;
  contentType?: string;
  body: unknown;
};

export type Tool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
};

export type ToolCallResult = {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

const PROTOCOL = "2025-11-25";

export class StreamableHttpClient {
  endpoint: string;
  sessionId: string | null = null;
  protocolVersion = PROTOCOL;
  serverInfo: { name?: string; version?: string; title?: string } | null = null;
  tools: Tool[] = [];
  onWire: (event: WireEvent) => void = () => {};
  private nextId = 1;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async initialize(): Promise<JsonRpcResponse> {
    const response = await this.request("initialize", {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: "chartkeep-alexa-simulator", version: "0.1.0" },
    });
    const result = (response.result ?? {}) as {
      protocolVersion?: string;
      serverInfo?: { name?: string; version?: string; title?: string };
    };
    if (result.protocolVersion) this.protocolVersion = result.protocolVersion;
    this.serverInfo = result.serverInfo ?? null;
    await this.notify("notifications/initialized");
    return response;
  }

  async listTools(): Promise<Tool[]> {
    const response = await this.request("tools/list", {});
    const tools = ((response.result as { tools?: Tool[] } | undefined)?.tools ?? []) as Tool[];
    this.tools = tools;
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    const response = await this.request("tools/call", { name, arguments: args });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.result ?? { content: [] }) as ToolCallResult;
  }

  async close(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await fetch(this.endpoint, {
        method: "DELETE",
        headers: this.headers(),
      });
    } finally {
      this.sessionId = null;
    }
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const payload: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    this.emit("out", { method, body: payload });
    const http = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    const parsed = await readMcpBody(http);
    this.captureSession(http);
    this.emit("in", { method, status: http.status, contentType: http.headers.get("content-type") ?? undefined, body: parsed ?? { status: http.status } });
  }

  private async request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const payload: JsonRpcRequest = { jsonrpc: "2.0", id: this.nextId++, method, params };
    this.emit("out", { method, body: payload });
    const http = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    this.captureSession(http);
    const parsed = await readMcpBody(http);
    this.emit("in", { method, status: http.status, contentType: http.headers.get("content-type") ?? undefined, body: parsed });
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`MCP ${method} returned ${http.status} with no JSON-RPC body`);
    }
    return parsed as JsonRpcResponse;
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": this.protocolVersion,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    return headers;
  }

  private captureSession(http: Response) {
    const id = http.headers.get("mcp-session-id") ?? http.headers.get("Mcp-Session-Id");
    if (id) this.sessionId = id;
  }

  private emit(direction: "out" | "in", extra: Omit<WireEvent, "id" | "at" | "direction">) {
    this.onWire({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: Date.now(),
      direction,
      ...extra,
    });
  }
}

export async function readMcpBody(http: Response): Promise<unknown> {
  const type = http.headers.get("content-type") ?? "";
  if (http.status === 202 || http.status === 204) return { accepted: true, status: http.status };
  const text = await http.text();
  if (!text) return { status: http.status };
  if (type.includes("text/event-stream")) {
    return parseSseJsonRpc(text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { status: http.status, text };
  }
}

export function parseSseJsonRpc(text: string): unknown {
  let last: unknown = null;
  let data = "";
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      data += line.slice(5).trimStart();
    } else if (line === "") {
      if (data) {
        try {
          last = JSON.parse(data);
        } catch {
          last = data;
        }
        data = "";
      }
    }
  }
  if (data) {
    try {
      last = JSON.parse(data);
    } catch {
      last = data;
    }
  }
  return last;
}

export function toolText(result: ToolCallResult): string {
  return result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text as string)
    .join("\n");
}

export function toolJson<T>(result: ToolCallResult): T {
  if (result.structuredContent) return result.structuredContent as T;
  const text = toolText(result);
  return JSON.parse(text) as T;
}
