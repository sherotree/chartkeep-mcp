# Friction log

Amazon Developer Hackathon 2026 · Alexa+ track · ChartKeep MCP

Format matches the Official Rules: task, steps, expected vs actual, severity, workaround, suggestion. These are from building this repo on 2026-10-14 against `@modelcontextprotocol/sdk` 1.32.1 and the public Alexa+ / Devpost docs.

Severity: **High** blocked a demo path. **Medium** forced a design choice. **Low** cost time but had a clear fix.

---

## F1. No way for an entrant to attach a self-hosted MCP server to Alexa+

- **Task:** Connect ChartKeep to a real Alexa+ client (device or Amazon Web Simulator) to verify headers, retries, and tool-call timeouts.
- **Steps:** Read [Alexa+ MCP QuickStart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) and the hackathon FAQ. Looked for an apply link for the Category SDK / MCP Toolkit / CLI / Web Simulator.
- **Expected:** A hackathon path to the preview tools, or a recorded Alexa+ MCP session we could replay.
- **Actual:** FAQ: the tools are select-partners only and there is no way to apply. The allowed path is a self-hosted MCP server plus your own web client that sends `initialize`, `tools/list`, and `tools/call`.
- **Severity:** High
- **Workaround:** Built `simulator/` as that client. It speaks Streamable HTTP and shows the wire. Unverified against live Alexa+.
- **Suggestion:** Publish a recorded Alexa+ MCP session (request headers, negotiated version, how long `tools/call` may run, retry behavior). Or open the Web Simulator to hackathon GitHub usernames.

---

## F2. Streamable HTTP Origin rules vs a Vite dev client

- **Task:** Let a page on `http://127.0.0.1:5173` POST JSON-RPC to `http://127.0.0.1:8787/mcp`.
- **Steps:** Read spec 2025-11-25 transports (validate `Origin`, bind localhost). Tried the SDK's `createMcpExpressApp()` helper, then a hand-rolled Express app with `cors`.
- **Expected:** One recommended local-dev pattern: allowed origins + `Mcp-Session-Id` exposed to the browser + Host-header checks.
- **Actual:** The spec forbids unknown origins (403). Browser CORS also needs `Access-Control-Allow-Headers` for `Mcp-Session-Id` and `MCP-Protocol-Version`, and `Access-Control-Expose-Headers` so `fetch` can read the session id. The SDK examples are written for curl/Node, not a page on another port. `createMcpExpressApp()` is Host-centric; pairing it with a Vite origin took more reading than writing our own middleware.
- **Severity:** Medium
- **Workaround:** Vite proxies `/mcp` to 8787 (no cross-origin `fetch` in the default demo). The server still lists localhost Vite origins and returns 403 for anything else. Bound to `127.0.0.1`.
- **Suggestion:** Add a “browser client on another localhost port” example to the TypeScript SDK: CORS allowlist, exposed session header, and a Vite proxy snippet.

---

## F3. JSON responses vs SSE, and an empty 202

- **Task:** Write a browser client that accepts both `application/json` and `text/event-stream`, as the spec requires.
- **Steps:** Implemented `readMcpBody()` for both. Pointed the server at `StreamableHTTPServerTransport` with `enableJsonResponse: true` (as in `jsonResponseStreamableHttp.ts`). Sent `notifications/initialized` after `initialize`.
- **Expected:** Every POST returns a JSON-RPC body. Session id always in `Mcp-Session-Id`.
- **Actual:** `initialize` and `tools/*` return JSON and the session header. `notifications/initialized` returns **202 Accepted with an empty body**. A client that always `JSON.parse`s the text throws. GET `/mcp` without wanting SSE is 405, which is legal. Header names come back as `mcp-session-id` (Node lowercases them); `Access-Control-Expose-Headers` must list that name or the browser hides it.
- **Severity:** Medium
- **Workaround:** Treat 202/204 as success. Parse SSE only when `Content-Type` says so. Read the session header case-insensitively. Default demo uses JSON mode so the wire log stays readable in three minutes.
- **Suggestion:** Document the 202-empty-body case next to `enableJsonResponse`. Show one browser `fetch` helper that handles JSON, SSE, and 202.

---

## F4. Alexa+ docs describe OAuth and latency that a hackathon server cannot prove

- **Task:** Decide whether ChartKeep must ship OAuth 2.1 + PKCE and a <500 ms budget to be eligible.
- **Steps:** Read the Alexa+ MCP QuickStart (remote HTTPS, PRM document, `S256`, Bearer on every call, 500 ms). Compared with the hackathon Official Rules and FAQ.
- **Expected:** A sentence that says which Alexa+ production rules apply to the “self-hosted + web simulator” submission path.
- **Actual:** Production Alexa+ wants OAuth and a public URL. Entrants cannot register that URL. The FAQ says a local repo plus a web MCP client is enough. Easy to overbuild auth that no judge can click.
- **Severity:** Medium
- **Workaround:** No auth, localhost only, tools that return in milliseconds (aggregates, no model). Noted the OAuth gap in the README instead of faking it.
- **Suggestion:** Split the Alexa+ MCP page into “hackathon / local” and “production add-on” so the OAuth and 500 ms rules do not look like submission blockers.

---

## F5. Grounding math is easy to get wrong once the table has more than two columns

- **Task:** Reuse plotkeep’s “facts first, then the sentence” rule on a 36-row table with quarter, region, and product.
- **Steps:** Ported series facts (first/last/min/max/change). Took `fastestGrowth` from the first category column. Ran a contradiction check that only allowed cell values and series stats.
- **Expected:** “Which product grew fastest?” → Butter Croissant. “Best-selling region?” → West at 309,000.
- **Actual:** The first category column is `region`. South has the highest *regional* percent change, so the first build said South grew fastest. The contradiction check then rejected West’s **grouped** total (309,000 is not a cell) and split `309,000` on the comma into `309` and `000`. Both answers collapsed to the same wrong template sentence.
- **Severity:** Low (product) / Medium (it shipped in the first test run)
- **Workaround:** Score growth across every category column and pick the winner. Allow aggregate results in the check. Parse thousands separators. Skip the rewrite on `list_columns` and on answers that already came from `query_facts`.
- **Suggestion:** A short “tabular facts” note in Alexa+ MCP guidance: if a tool returns numbers, say whether they are cells or aggregates, so voice replies stay auditable.
