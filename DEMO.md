# Demo video script (≤ 3 minutes)

Record the browser at 1280×800 or 1920×1080. Terminal on the left or a cutaway at the start. Speak in the second person as if you are asking Alexa.

---

**0:00–0:20 · Why this exists**

> ChartKeep is an Alexa+ add-on you can run today without partner preview access. A self-hosted MCP server, spec 2025-11-25, Streamable HTTP. This web page is the Alexa+ client: it sends initialize, tools/list, and tools/call.

Show `README.md` for one beat, then the two commands:

```bash
npm install
npm run dev
```

**0:20–0:40 · Handshake**

Open `http://127.0.0.1:5173`. Point at the live badge, spec `2025-11-25`, and the session id.

Scroll the MCP wire. Call out:

1. `POST initialize` → `Mcp-Session-Id`
2. `notifications/initialized` → 202
3. `tools/list` → `load_dataset`, `list_columns`, `query_facts`, `suggest_chart`, `ask_about_data`

> Those five tools are what Alexa+ would see.

**0:40–1:20 · Voice Q&A, grounded**

Click **Alexa, what's our best-selling region?**

Wait for the amber orb, the `ask_about_data` line, and the spoken reply: West, 309,000. Point at the chart plate.

> The number is a sum from the CSV. The model never invented it. There is no model in this demo.

Click **Alexa, which product grew fastest?** Butter Croissant.

**1:20–2:10 · A chart Alexa can describe**

Click **Alexa, chart quarterly revenue**. Show the line.

Click **Alexa, show a pie of revenue by region**. Show the pie and the tool JSON in the wire (ECharts option).

Optional, if time: **What columns are in this spreadsheet?**

**2:10–2:40 · Your own CSV**

Upload a tiny CSV or say you could. Click **Use sample CSV** to snap back.

> Same tools. New table. Nothing left the machine.

**2:40–3:00 · Close**

> When Alexa+ partner tooling opens, this `/mcp` endpoint is what you point at. Until then, this page is the official fallback: a real MCP client, not a mock. MIT, public repo, two commands.

End on the live badge + a chart.

---

## Shot list

| Shot | What to show |
|---|---|
| Terminal | `npm run dev`, both processes green |
| Simulator mast | live / 2025-11-25 / session |
| Wire | initialize + tools/list |
| Transcript | region question + tool line + answer |
| Plate | pie or line from the tool result |
| Dock | sample CSV name, 36 rows |

Do not show a real Echo. The FAQ says not to. Do not claim a live Alexa+ connection.
