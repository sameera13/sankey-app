/**
 * App.jsx  –  React + Plotly Sankey with node‑level percentages + KPI cards + Summary Table
 *
 * Drop this file into a Vite/CRA project, `npm i xlsx plotly.js react-plotly.js`,
 * then `npm run dev` and upload your Excel file.
 */
import React, { useState, useEffect, useMemo } from "react";
import Plot from "react-plotly.js";
import * as XLSX from "xlsx";

/* ─────────── constants ─────────── */
const EVENT_ORDER = [
  "CreateSession",
  "ValidateAddress",
  "GetQualifiedProducts",
  "CreateOrder",
  "SaveOrderProducts",
  "EstimateFirstBill",
  "GetDueDates",
  "SetDueDates",
  "CreditCheck",
  "SubmitOrder",
];

const COLUMN_X = {
  CLIENT: 0.02,
  CreateSession: 0.25,
  ValidateAddress: 0.40,
  GetQualifiedProducts: 0.60,
  CreateOrder: 0.72,
  SaveOrderProducts: 0.80,
  EstimateFirstBill: 0.85,
  GetDueDates: 0.90,
  SetDueDates: 0.94,
  CreditCheck: 0.97,
  SubmitOrder: 0.995,
  DROP: 1.0,
};

// Professional color palette with better contrast and visual hierarchy
const NODE_PALETTE = {
  DEFAULT: "#475569",        // Slate-600
  CLIENT: "#7c3aed",         // Violet-600 - Starting point
  CreateSession: "#2563eb",  // Blue-600 - Initial engagement
  ValidateAddress: "#0284c7", // Sky-600 - Validation phase
  GetQualifiedProducts: "#0891b2", // Cyan-600 - Product discovery
  CreateOrder: "#059669",    // Emerald-600 - Order creation
  SaveOrderProducts: "#16a34a", // Green-600 - Product saving
  EstimateFirstBill: "#65a30d", // Lime-600 - Billing estimate
  GetDueDates: "#ca8a04",    // Yellow-600 - Due date retrieval
  SetDueDates: "#ea580c",    // Orange-600 - Due date setting
  CreditCheck: "#eab308",    // Teal-700 - Credit verification (updated)
  "Dropped @ CreateOrder": "#FBCEB1", // Orange‑500 – highlight specific drop‑off
  SubmitOrder: "#15803d",    // Green-700 - Success state
  DROP: "#64748b",          // Slate-500 - Drop-off
};

const rgba = (hex, a = 0.7) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(
    hex.slice(3, 5),
    16
  )},${parseInt(hex.slice(5, 7), 16)},${a})`;

/* ─────────── helpers ─────────── */
function parseSessions(rows) {
  const sessions = new Map();
  rows.forEach((r) => {
    const keys = Object.fromEntries(
      Object.keys(r).map((k) => [k.toLowerCase(), k])
    );
    const client = r[keys["strclientid"]]?.toString().trim() || "";
    const sid = r[keys["strsessionid"]]?.toString().trim() || "";
    let evtRaw = r[keys["methodname"]]?.toString().trim() || "";
    if (!client || !sid || !evtRaw) return;
    if (evtRaw.includes("SAVESMARTCART") && evtRaw.includes("SUCCESS")) return;
    /* normalise */
    let evt = evtRaw.toLowerCase();
    if (evt === "saveorderedproducts") evt = "SaveOrderProducts";
    else if (evt === "submitorder") evt = "SubmitOrder";
    else if (evt === "setduedates" || evt === "setduedate") evt = "SetDueDates";
    else {
      const match = EVENT_ORDER.find((e) =>
        evtRaw.toLowerCase().startsWith(e.toLowerCase())
      );
      evt = match || evtRaw;
    }
    if (!sessions.has(sid)) sessions.set(sid, { client, events: [] });
    sessions.get(sid).events.push(evt);
  });
  return sessions;
}

function sortAndCleanSessions(sessions) {
  sessions.forEach((s) => {
    s.events.sort((a, b) => {
      const A = EVENT_ORDER.indexOf(a);
      const B = EVENT_ORDER.indexOf(b);
      return (A === -1 ? 99 : A) - (B === -1 ? 99 : B);
    });
    s.events = s.events.filter((e, i, arr) => i === 0 || e !== arr[i - 1]);
    const end = s.events.indexOf("SubmitOrder");
    if (end !== -1) s.events = s.events.slice(0, end + 1);
  });
}

/* ─────────── Sankey builder ─────────── */
function buildSankeyData(sessions) {
  const labels = [],
    xs = [],
    ys = [],
    nodeColors = [];
  const allClients = [...new Set([...sessions.values()].map((s) => s.client))].sort();
  const idxOf = (lbl, x) => {
    const i = labels.indexOf(lbl);
    if (i !== -1) return i;
    labels.push(lbl);
    xs.push(x);
    if (allClients.includes(lbl)) {
      const gap = 1 / (allClients.length + 1);
      ys.push(gap * (allClients.indexOf(lbl) + 1));
    } else ys.push(null);
    nodeColors.push(NODE_PALETTE[lbl] || NODE_PALETTE.DEFAULT);
    return labels.length - 1;
  };
  const linkCounts = new Map(),
    outTotals = new Map(),
    nodeEntryCounts = new Map();
  sessions.forEach(({ client, events }) => {
    const path = [client, ...events];
    for (let i = 0; i < path.length - 1; i++) {
      const src = path[i],
        tgt = path[i + 1],
        key = `${src}||${tgt}`;
      if (src === tgt) continue;
      linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
      outTotals.set(src, (outTotals.get(src) || 0) + 1);
      nodeEntryCounts.set(tgt, (nodeEntryCounts.get(tgt) || 0) + 1);
    }
    const last = path[path.length - 1];
    if (last !== "SubmitOrder") {
      const drop = `Dropped @ ${last}`,
        key = `${last}||${drop}`;
      linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
      outTotals.set(last, (outTotals.get(last) || 0) + 1);
      nodeEntryCounts.set(drop, (nodeEntryCounts.get(drop) || 0) + 1);
    }
  });
  [...linkCounts.keys()].forEach((k) => {
    const [s, t] = k.split("||");
    idxOf(s, COLUMN_X[s] ?? COLUMN_X.CLIENT);
    idxOf(t, t.startsWith("Dropped") ? COLUMN_X.DROP : COLUMN_X[t] ?? COLUMN_X.DROP);
  });
  const totalSessions = sessions.size;
  const nodeLabelsPct = labels.map((lbl) => {
    if (allClients.includes(lbl)) return lbl;
    if (EVENT_ORDER.includes(lbl) || lbl.startsWith("Dropped")) {
      const pct = totalSessions
        ? (((nodeEntryCounts.get(lbl) || 0) / totalSessions) * 100).toFixed(1)
        : 0;
      return `${lbl} (${pct}%)`;
    }
    return lbl;
  });
  const source = [],
    target = [],
    value = [],
    color = [],
    hover = [];
  linkCounts.forEach((cnt, k) => {
    const [s, t] = k.split("||"),
      si = labels.indexOf(s),
      ti = labels.indexOf(t);
    const pct = ((cnt / outTotals.get(s)) * 100).toFixed(1);
    source.push(si);
    target.push(ti);
    value.push(cnt);
    color.push(
      t.startsWith("Dropped")
        ? rgba(NODE_PALETTE.DROP, 0.65)
        : t === "SubmitOrder"
        ? rgba("#15803d", 0.8) // Success green
        : rgba(nodeColors[si], 0.6)
    );
    hover.push(`${s} → ${t}<br>${cnt} sessions (${pct}%)`);
  });
  return {
    type: "sankey",
    orientation: "h",
    arrangement: "snap",
    node: {
      label: nodeLabelsPct,
      x: xs,
      y: ys,
      pad: 30,
      thickness: 20,
      color: nodeColors,
      line: { color: "rgba(51,65,85,0.3)", width: 1 },
      hovertemplate: "<b>%{label}</b><extra></extra>",
    },
    link: {
      source,
      target,
      value,
      color,
      customdata: hover,
      line: { color: "rgba(51,65,85,0.1)", width: 0.5 },
      hovertemplate: "%{customdata}<extra></extra>",
    },
    valueformat: ".0f",
    valuesuffix: " sessions",
  };
}

/* ─────────── component ─────────── */
export default function App() {
  const [rows, setRows] = useState([]);
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState({ total: 0, completed: 0, dropped: 0 });
  const [error, setError] = useState(null);
  const [clientFilter, setClientFilter] = useState("");

  // New state for summary table
  const [clientEventSummary, setClientEventSummary] = useState({});

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      try {
        const wb = XLSX.read(target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        setRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Error reading Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /* rebuild Sankey, KPIs & summary on data/filter change */
  useEffect(() => {
    if (!rows.length) {
      setData(null);
      setMetrics({ total: 0, completed: 0, dropped: 0 });
      setClientEventSummary({});
      return;
    }
    const filtered = clientFilter.trim()
      ? rows.filter((r) =>
          (r[Object.keys(r).find((k) => k.toLowerCase() === "strclientid")] || "")
            .toString()
            .toLowerCase()
            .includes(clientFilter.toLowerCase())
        )
      : rows;
    const sessions = parseSessions(filtered);
    sortAndCleanSessions(sessions);

    /* ───── KPI counters ───── */
    const totalSessions = sessions.size;
    let completed = 0;
    sessions.forEach(({ events }) => {
      if (events.length && events[events.length - 1] === "SubmitOrder") completed++;
    });

    setMetrics({
      total: totalSessions,
      completed,
      dropped: totalSessions - completed,
    });

    /* ───── Build client-event summary for table ───── */
    const clientEventCounts = {};
    sessions.forEach(({ client, events }) => {
      if (!clientEventCounts[client]) clientEventCounts[client] = {};

      // Unique visited events for this session
      const visited = new Set(events);

      // Add drop point if not completed
      const lastEvt = events[events.length - 1];
      if (lastEvt !== "SubmitOrder") {
        visited.add(`Dropped @ ${lastEvt}`);
      }

      visited.forEach((evt) => {
        clientEventCounts[client][evt] = (clientEventCounts[client][evt] || 0) + 1;
      });
    });
    setClientEventSummary(clientEventCounts);

    setData(buildSankeyData(sessions));
  }, [rows, clientFilter]);

  const chartHeight = useMemo(() => {
    if (!data) return 800;
    const clientCount = data.node.label.filter(
      (l) =>
        !EVENT_ORDER.some((e) => l.startsWith(e)) && !l.startsWith("Dropped")
    ).length;
    return Math.max(800, Math.min(1200, clientCount * 25 + 400));
  }, [data]);

  /* ─────────── UI ─────────── */
  return (
    <div className="min-h-screen bg-[#FFF8F0] text-slate-800 p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* header */}
        <header className="text-center mb-2">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent mb-2">
            Customer Journey Analytics
          </h1>
          <p className="text-slate-600 text-lg">
            Interactive Sankey Diagram Visualization of User Flow Patterns
          </p>
        </header>

        {/* upload / filter */}
        <section className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-200 shadow-lg">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="relative cursor-pointer group">
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleUpload}
                  className="sr-only"
                />
                <div className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-200 group-hover:scale-105 group-hover:shadow-xl">
                  📁 Upload Excel File
                </div>
              </label>
              {rows.length > 0 && (
                <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg border border-emerald-200">
                  ✅ {rows.length.toLocaleString()} records loaded
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-600 text-sm font-medium">Filter:</label>
              <input
                type="text"
                placeholder="Search Client ID..."
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-w-[220px] shadow-sm"
              />
            </div>
          </div>
        </section>

        {/* error */}
        {error && (
          <section className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-mono flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              {error}
            </p>
          </section>
        )}

        {/* Sankey */}
        <section className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-200 shadow-lg">
          {data ? (
            <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-sm">
              <Plot
                data={[data]}
                layout={{
                  font: {
                    size: 12,
                    color: "#334155",
                    family: "Inter, system-ui, sans-serif",
                  },
                  paper_bgcolor: "rgba(255,255,255,0.98)",
                  plot_bgcolor: "rgba(0,0,0,0)",
                  margin: { l: 20, r: 20, t: 50, b: 60 },
                  width: undefined,
                  autosize: true,
                  height: chartHeight,
                  title: {
                    text: "Customer Journey Flow Analysis",
                    font: { size: 18, color: "#475569" },
                    x: 0.5,
                    y: 0.98,
                  },
                  annotations: [
                    {
                      text: "Interactive flow visualization showing customer progression through service touchpoints • Hover for details • Scroll to zoom",
                      x: 0.5,
                      y: 0.02,
                      xref: "paper",
                      yref: "paper",
                      xanchor: "center",
                      yanchor: "bottom",
                      showarrow: false,
                      font: { size: 11, color: "#64748b" },
                    },
                  ],
                  hovermode: "closest",
                  dragmode: "pan",
                }}
                config={{
                  responsive: true,
                  displayModeBar: true,
                  displaylogo: false,
                  modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
                  scrollZoom: true,
                  toImageButtonOptions: {
                    format: 'png',
                    filename: 'customer_journey_sankey',
                    height: chartHeight,
                    width: 1200,
                    scale: 1
                  }
                }}
                style={{ width: "100%", height: `${chartHeight}px` }}
              />
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500">
              <div className="text-8xl mb-6">📈</div>
              <h3 className="text-2xl font-semibold mb-3 text-slate-700">Ready to Analyze</h3>
              <p className="text-lg mb-2">Upload your Excel file to generate the interactive Sankey diagram</p>
              <p className="text-sm text-slate-400">
                Supported formats: .xls, .xlsx • Maximum file size: 50MB
                </p>
        </div>
      )}
    </section>

    {/* KPIs + Summary Table */}
    {metrics.total > 0 && (
      <>
        <section className="flex flex-wrap gap-6 justify-center">
          <div className="flex flex-col items-center bg-gradient-to-tr from-violet-600 to-cyan-600 text-white px-6 py-5 rounded-xl shadow-lg w-40">
            <span className="text-2xl font-extrabold">{metrics.total.toLocaleString()}</span>
            <span className="text-sm font-medium tracking-wide">Total Sessions</span>
          </div>
          <div className="flex flex-col items-center bg-green-600 text-white px-6 py-5 rounded-xl shadow-lg w-40">
            <span className="text-2xl font-extrabold">{metrics.completed.toLocaleString()}</span>
            <span className="text-sm font-medium tracking-wide">Completed Orders</span>
          </div>
          <div className="flex flex-col items-center bg-red-600 text-white px-6 py-5 rounded-xl shadow-lg w-40">
            <span className="text-2xl font-extrabold">{metrics.dropped.toLocaleString()}</span>
            <span className="text-sm font-medium tracking-wide">Dropped Sessions</span>
          </div>
        </section>

        {/* Summary table */}
        <section className="mt-8 overflow-auto rounded-xl border border-slate-200 bg-white/80 backdrop-blur-xl p-4 shadow-lg max-w-full">
          <h2 className="text-xl font-semibold mb-4 text-slate-700">Session Summary by Client & Event</h2>
          <table className="w-full border-collapse text-sm min-w-[600px]">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="border border-slate-300 px-3 py-2 sticky top-0 bg-slate-100 z-10 text-left">Client</th>
                {[
                  ...EVENT_ORDER,
                  ...Object.keys(clientEventSummary)
                    .flatMap(c => Object.keys(clientEventSummary[c] || {}))
                    .filter(evt => evt.startsWith("Dropped @ "))
                    .filter((v, i, a) => a.indexOf(v) === i)
                ].map((evt) => (
                  <th
                    key={evt}
                    className="border border-slate-300 px-3 py-2 sticky top-0 bg-slate-100 z-10"
                    title={evt.startsWith("Dropped @ ") ? `Drop-off after ${evt.slice(9)}` : undefined}
                  >
                    {evt}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(clientEventSummary).map(([client, evtCounts]) => (
                <tr key={client} className="even:bg-slate-50">
                  <td className="border border-slate-300 px-3 py-2 font-medium">{client}</td>
                  {[
                    ...EVENT_ORDER,
                    ...Object.keys(clientEventSummary)
                      .flatMap(c => Object.keys(clientEventSummary[c] || {}))
                      .filter(evt => evt.startsWith("Dropped @ "))
                      .filter((v, i, a) => a.indexOf(v) === i)
                  ].map((evt) => (
                    <td key={evt} className="border border-slate-300 px-3 py-2 text-center">
                      {evtCounts[evt] || 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    )}
  </div>
</div>
  );
}