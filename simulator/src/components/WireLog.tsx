import type { WireEvent } from "../mcp/client";

type Props = {
  events: WireEvent[];
};

export function WireLog({ events }: Props) {
  return (
    <section className="wire">
      <header>
        <p className="kicker">Streamable HTTP</p>
        <h2>MCP wire</h2>
      </header>
      <ol>
        {events.length === 0 ? <li className="wire-empty">No frames yet. Connect to see initialize.</li> : null}
        {[...events].reverse().map((event) => (
          <li key={event.id} className={event.direction}>
            <div className="wire-meta">
              <span>{event.direction === "out" ? "POST" : "←"}</span>
              <strong>{event.method ?? "response"}</strong>
              {event.status ? <em>{event.status}</em> : null}
              {event.contentType ? <code>{shortType(event.contentType)}</code> : null}
            </div>
            <pre>{preview(event.body)}</pre>
          </li>
        ))}
      </ol>
    </section>
  );
}

function shortType(value: string): string {
  if (value.includes("event-stream")) return "text/event-stream";
  if (value.includes("json")) return "application/json";
  return value;
}

function preview(body: unknown): string {
  const text = JSON.stringify(body, null, 2);
  return text.length > 1400 ? `${text.slice(0, 1400)}\n…` : text;
}
