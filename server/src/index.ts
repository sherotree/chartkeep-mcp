import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createChartKeepServer } from "./createServer.js";
import { forgetSession, sampleCsvText } from "./dataset.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const PROTOCOL = "2025-11-25";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
]);

type LiveSession = {
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, LiveSession>();

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Accept",
      "Mcp-Session-Id",
      "MCP-Session-Id",
      "MCP-Protocol-Version",
      "Last-Event-ID",
    ],
    exposedHeaders: ["Mcp-Session-Id", "MCP-Session-Id", "MCP-Protocol-Version"],
  }),
);
app.use(express.json({ limit: "4mb" }));

app.use((req, res, next) => {
  const origin = req.header("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: `Forbidden origin: ${origin}` },
      id: null,
    });
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "chartkeep",
    protocol: PROTOCOL,
    transport: "streamable-http",
    endpoint: "/mcp",
  });
});

app.get("/sample.csv", (_req, res) => {
  res.type("text/csv").send(sampleCsvText());
});

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = header(req, "mcp-session-id");
    let live = sessionId ? sessions.get(sessionId) : undefined;

    if (live) {
      await live.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          sessions.set(id, { transport });
        },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) {
          sessions.delete(id);
          forgetSession(id);
        }
      };
      const server = createChartKeepServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: no valid MCP session. Send initialize first." },
      id: null,
    });
  } catch (error) {
    console.error("POST /mcp failed", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = header(req, "mcp-session-id");
  const live = sessionId ? sessions.get(sessionId) : undefined;
  if (!live) {
    res.status(405).set("Allow", "POST, DELETE").json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "GET SSE is optional here. Use POST with enableJsonResponse." },
      id: null,
    });
    return;
  }
  await live.transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = header(req, "mcp-session-id");
  const live = sessionId ? sessions.get(sessionId) : undefined;
  if (!live) {
    res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unknown session" },
      id: null,
    });
    return;
  }
  await live.transport.handleRequest(req, res);
  if (sessionId) {
    sessions.delete(sessionId);
    forgetSession(sessionId);
  }
});

function header(req: express.Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

app.listen(PORT, HOST, () => {
  console.log(`ChartKeep MCP ${PROTOCOL} Streamable HTTP on http://${HOST}:${PORT}/mcp`);
  console.log(`Health: http://${HOST}:${PORT}/health`);
});
