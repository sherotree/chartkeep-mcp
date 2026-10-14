import { useEffect, useMemo, useRef, useState } from "react";
import { handleUtterance } from "./agent/router";
import { ChartPlate } from "./components/ChartPlate";
import { WireLog } from "./components/WireLog";
import { StreamableHttpClient, type Tool, type WireEvent } from "./mcp/client";

const CHIPS = [
  "Alexa, what columns are in this spreadsheet?",
  "Alexa, what's our best-selling region?",
  "Alexa, which product grew fastest?",
  "Alexa, chart quarterly revenue",
  "Alexa, show a pie of revenue by region",
];

type Line = {
  id: string;
  role: "heard" | "said" | "tool";
  text: string;
};

type DatasetInfo = {
  name: string;
  rows: number;
  columns: string[];
  source: string;
};

export function App() {
  const [endpoint, setEndpoint] = useState("/mcp");
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [wire, setWire] = useState<WireEvent[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [orb, setOrb] = useState<"rest" | "listen" | "think">("rest");
  const [chart, setChart] = useState<Record<string, unknown> | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const clientRef = useRef<StreamableHttpClient | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const client = useMemo(() => {
    const next = new StreamableHttpClient(endpoint);
    next.onWire = (event) => setWire((prev) => [...prev.slice(-40), event]);
    return next;
  }, [endpoint]);

  useEffect(() => {
    clientRef.current = client;
    void connect(client);
    return () => {
      void client.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines, busy]);

  async function connect(next: StreamableHttpClient) {
    setStatus("connecting");
    setError(null);
    try {
      await next.initialize();
      const listed = await next.listTools();
      setTools(listed);
      setSessionId(next.sessionId);
      const loaded = await next.callTool("load_dataset", { source: "sample" });
      const info = parseDataset(loaded);
      setDataset(info);
      setStatus("live");
      setLines([
        {
          id: "hello",
          role: "said",
          text: `ChartKeep is on the line. Sample ${info?.name ?? "retail-sales.csv"} is loaded. Ask the way you would ask Alexa.`,
        },
      ]);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to reach the MCP server");
    }
  }

  async function speak(text: string) {
    const utterance = text.trim();
    if (!utterance || !clientRef.current || busy) return;
    setDraft("");
    setBusy(true);
    setOrb("listen");
    setLines((prev) => [...prev, { id: crypto.randomUUID(), role: "heard", text: utterance }]);
    await pause(280);
    setOrb("think");
    try {
      const turn = await handleUtterance(clientRef.current, utterance);
      setChart(turn.chart);
      setInsight(turn.insight);
      setLines((prev) => [
        ...prev,
        ...turn.tools.map((tool) => ({
          id: crypto.randomUUID(),
          role: "tool" as const,
          text: `${tool.name}(${Object.keys(tool.args).join(", ")})`,
        })),
        { id: crypto.randomUUID(), role: "said", text: turn.spoken },
      ]);
    } catch (err) {
      setLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "said",
          text: err instanceof Error ? err.message : "The MCP tool call failed.",
        },
      ]);
    } finally {
      setBusy(false);
      setOrb("rest");
    }
  }

  async function onUpload(file: File) {
    const csv = await file.text();
    if (!clientRef.current) return;
    const result = await clientRef.current.callTool("load_dataset", { source: "csv", csv, name: file.name });
    setDataset(parseDataset(result));
    setChart(null);
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "said", text: `Loaded ${file.name}. Same tools, new table.` },
    ]);
  }

  async function onSample() {
    if (!clientRef.current) return;
    const result = await clientRef.current.callTool("load_dataset", { source: "sample" });
    setDataset(parseDataset(result));
    setChart(null);
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "said", text: "Back to the bundled cafe sales sample." },
    ]);
  }

  return (
    <div className="room">
      <div className="grain" aria-hidden="true" />
      <header className="mast">
        <div>
          <p className="kicker">Amazon Developer Hackathon 2026 · Alexa+ track</p>
          <h1>ChartKeep</h1>
          <p className="lede">A listening room for a spreadsheet. This page is the Alexa+ client: initialize, tools/list, tools/call over Streamable HTTP.</p>
        </div>
        <dl className={`badge ${status}`}>
          <div>
            <dt>MCP</dt>
            <dd>{status === "live" ? "live" : status}</dd>
          </div>
          <div>
            <dt>spec</dt>
            <dd>2025-11-25</dd>
          </div>
          <div>
            <dt>session</dt>
            <dd>{sessionId ? sessionId.slice(0, 8) : "—"}</dd>
          </div>
        </dl>
      </header>

      <div className="stage">
        <aside className="dock">
          <section>
            <p className="kicker">Dataset</p>
            <h2>{dataset?.name ?? "No table"}</h2>
            <p>{dataset ? `${dataset.rows} rows · ${dataset.columns.length} columns · ${dataset.source}` : "Connect to load the sample."}</p>
            <div className="chips columns">
              {dataset?.columns.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => void onSample()}>
                Use sample CSV
              </button>
              <label className="file">
                Upload CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </section>
          <section>
            <p className="kicker">Say it like Alexa</p>
            <div className="chips prompts">
              {CHIPS.map((chip) => (
                <button key={chip} type="button" onClick={() => void speak(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          </section>
          <section>
            <p className="kicker">Tools</p>
            <ul className="tool-list">
              {tools.map((tool) => (
                <li key={tool.name}>
                  <strong>{tool.name}</strong>
                  <span>{tool.description}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <main className="console">
          <div className={`orb ${orb}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="orb-caption">
            {orb === "listen" ? "Heard you." : orb === "think" ? "Calling MCP tools…" : "Simulated Alexa+ · waiting"}
          </p>
          <div className="transcript" ref={scroller}>
            {lines.map((line) => (
              <article key={line.id} className={line.role}>
                <span>{line.role === "heard" ? "You" : line.role === "tool" ? "tool" : "ChartKeep"}</span>
                <p>{line.text}</p>
              </article>
            ))}
            {error ? (
              <article className="said">
                <span>ChartKeep</span>
                <p>{error} Start the MCP server on port 8787, then reload.</p>
              </article>
            ) : null}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void speak(draft);
            }}
          >
            <label>
              Ask
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Alexa, what's our best-selling region?"
                disabled={status !== "live" || busy}
              />
            </label>
            <button type="submit" disabled={status !== "live" || busy || !draft.trim()}>
              Speak
            </button>
          </form>
        </main>

        <div className="rail">
          <ChartPlate option={chart} insight={insight} />
          <WireLog events={wire} />
          <label className="endpoint">
            MCP endpoint
            <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </label>
        </div>
      </div>
    </div>
  );
}

function parseDataset(result: { content?: Array<{ text?: string }>; structuredContent?: unknown }): DatasetInfo | null {
  const structured = result.structuredContent as DatasetInfo | undefined;
  if (structured?.name) return structured as DatasetInfo;
  const text = result.content?.find((c) => c.text)?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as DatasetInfo;
  } catch {
    return null;
  }
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
