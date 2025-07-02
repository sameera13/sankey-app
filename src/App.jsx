/**
 * App.jsx  –  React + Plotly Sankey with node‑level percentages + KPI cards
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

const NODE_PALETTE = {
  DEFAULT: "#64748b",
  CLIENT: "#8b5cf6",
  CreateSession: "#6366f1",
  ValidateAddress: "#3b82f6",
  GetQualifiedProducts: "#06b6d4",
  CreateOrder: "#10b981",
  SaveOrderProducts: "#22c55e",
  EstimateFirstBill: "#84cc16",
  GetDueDates: "#eab308",
  SetDueDates: "#f59e0b",
  CreditCheck: "#f97316",
  SubmitOrder: "#059669",
  DROP: "#ef4444",
};

const rgba = (hex, a = 0.6) =>
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
        ? rgba("#ef4444", 0.7)
        : t === "SubmitOrder"
        ? rgba("#059669", 0.8)
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
      line: { color: "rgba(255,255,255,0.2)", width: 2 },
      hovertemplate: "<b>%{label}</b><extra></extra>",
    },
    link: {
      source,
      target,
      value,
      color,
      customdata: hover,
      line: { color: "rgba(255,255,255,0.1)", width: 0.5 },
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

  /* rebuild Sankey & KPIs on data/filter change */
  useEffect(() => {
    if (!rows.length) {
      setData(null);
      setMetrics({ total: 0, completed: 0, dropped: 0 });
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* header */}
        <header>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Path Visualization
          </h1>
          <p className="text-slate-400 mt-1">
            A Sankey Chart Analysis of User Flows
          </p>
        </header>

        {/* KPI cards */}
        {metrics.total > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title="Total Sessions"
              value={metrics.total.toLocaleString()}
              className="text-emerald-400"
            />
            <StatCard
              title="Completed (SubmitOrder)"
              value={`${metrics.completed.toLocaleString()} (${(
                (metrics.completed / metrics.total) *
                100
              ).toFixed(1)}%)`}
              className="text-lime-300"
            />
            <StatCard
              title="Dropped"
              value={`${metrics.dropped.toLocaleString()} (${(
                (metrics.dropped / metrics.total) *
                100
              ).toFixed(1)}%)`}
              className="text-red-400"
            />
          </section>
        )}

        {/* upload / filter */}
        <section className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl flex flex-wrap gap-4 items-center">
          <label className="relative cursor-pointer">
            <input
              type="file"
              accept=".xls,.xlsx"
              onChange={handleUpload}
              className="sr-only"
            />
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg">
              📁 Choose Excel File
            </div>
          </label>
          {rows.length > 0 && (
            <div className="bg-emerald-500/20 text-emerald-300 px-4 py-2 rounded-lg border border-emerald-500/30">
              ✅ {rows.length.toLocaleString()} records loaded
            </div>
          )}
          <input
            type="text"
            placeholder="Filter by Client ID"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="ml-auto px-4 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-[200px]"
          />
        </section>

        {/* error */}
        {error && (
          <section className="bg-red-500/20 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-300 font-mono">{error}</p>
          </section>
        )}

        {/* Sankey */}
        <section className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl">
          {data ? (
            <div className="overflow-hidden max-h-[900px] border border-white/10 rounded-lg bg-slate-800/50">
              <Plot
                data={[data]}
                layout={{
                  font: {
                    size: 11,
                    color: "#f8fafc",
                    family: "Inter, system-ui, sans-serif",
                  },
                  paper_bgcolor: "rgba(30,41,59,0.8)",
                  plot_bgcolor: "rgba(0,0,0,0)",
                  margin: { l: 20, r: 20, t: 40, b: 40 },
                  width: undefined,
                  autosize: true,
                  height: chartHeight,

                  annotations: [
                    {
                      text: "Flow visualization showing customer progression through service touchpoints",
                      x: 0.5,
                      y: 0.02,
                      xref: "paper",
                      yref: "paper",
                      xanchor: "center",
                      yanchor: "bottom",
                      showarrow: false,
                      font: { size: 11, color: "#94a3b8" },
                    },
                  ],
                  hovermode: "closest",
                  dragmode: "pan",
                }}
                config={{
                  responsive: false,
                  displayModeBar: true,
                  displaylogo: false,
                  modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
                  scrollZoom: true,
                }}
                style={{ width: "100%", height: `${chartHeight}px` }}
              />
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-lg mb-2">Ready to analyze your data</p>
              <p className="text-sm">
                Upload an Excel file to generate the interactive Sankey diagram
              </p>
            </div>
          )}
        </section>
        
      </div>
    </div>
  );
}

/* ───── simple KPI card ───── */
function StatCard({ title, value, className = "" }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl text-center">
      <div className={`text-4xl font-extrabold ${className}`}>{value}</div>
      <div className="text-slate-300 mt-1">{title}</div>
    </div>
  );
}
