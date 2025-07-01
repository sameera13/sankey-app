import React, { useState, useEffect, useMemo } from "react";
import Plot from "react-plotly.js";
import * as XLSX from "xlsx";

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
  CLIENT: 0.05,
  CreateSession: 0.15,
  ValidateAddress: 0.25,
  GetQualifiedProducts: 0.35,
  CreateOrder: 0.45,
  SaveOrderProducts: 0.55,
  EstimateFirstBill: 0.65,
  GetDueDates: 0.75,
  SetDueDates: 0.82,
  CreditCheck: 0.89,
  SubmitOrder: 0.95,
  DROP: 0.98,
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

function rgba(hex, a = 0.6) {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(
    hex.slice(3, 5),
    16
  )},${parseInt(hex.slice(5, 7), 16)},${a})`;
}

function parseSessions(rows) {
  const sessions = new Map();
  rows.forEach((r) => {
    const keysLower = Object.keys(r).reduce((acc, k) => {
      acc[k.toLowerCase()] = k;
      return acc;
    }, {});
    const client = r[keysLower["strclientid"]]?.toString().trim() || "";
    const sid = r[keysLower["strsessionid"]]?.toString().trim() || "";
    let evtRaw = r[keysLower["methodname"]]?.toString().trim() || "";
    if (!client || !sid || !evtRaw) return;
    if (evtRaw.includes("SAVESMARTCART") && evtRaw.includes("SUCCESS")) return;
    // Normalize event names
    let evt = evtRaw.toLowerCase();
    if (evt === "submitorder") evt = "SubmitOrder";
    else if (evt === "setduedates" || evt === "setduedate") evt = "SetDueDates";
    else {
      const match = EVENT_ORDER.find(
        (e) => e.toLowerCase() === evt.toLowerCase()
      );
      if (match) evt = match;
      else evt = evtRaw;
    }
    if (!sessions.has(sid)) {
      sessions.set(sid, { client, events: [] });
    }
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

function buildSankeyData(sessions) {
  const labels = [],
    xs = [],
    ys = [],
    nodeColors = [];
  
  // Get all unique clients first to calculate proper spacing
  const allClients = [...new Set([...sessions.values()].map(s => s.client))].sort();
  
  // helper to create / reuse a node index
  const idxOf = (lbl, x) => {
    const i = labels.indexOf(lbl);
    if (i !== -1) return i;
    labels.push(lbl);
    xs.push(x);
    
    // For client nodes, distribute them evenly in vertical space
    if (allClients.includes(lbl)) {
      const clientIndex = allClients.indexOf(lbl);
      const spacing = 1.0 / Math.max(allClients.length + 1, 10);
      ys.push(spacing * (clientIndex + 1));
    } else {
      ys.push(null); // Let Plotly auto-position non-client nodes
    }
    
    nodeColors.push(NODE_PALETTE[lbl] || NODE_PALETTE.DEFAULT);
    return labels.length - 1;
  };
  
  const linkCounts = new Map();
  const outTotals = new Map();
  
  // accumulate link frequencies & totals
  sessions.forEach(({ client, events }) => {
    const path = [client, ...events];
    for (let i = 0; i < path.length - 1; i++) {
      const src = path[i];
      const tgt = path[i + 1];
      if (src === tgt) continue;
      const key = `${src}||${tgt}`;
      linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
      outTotals.set(src, (outTotals.get(src) || 0) + 1);
    }
    const last = path[path.length - 1];
    if (last !== "SubmitOrder") {
      const drop = `Dropped @ ${last}`;
      const key = `${last}||${drop}`;
      linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
      outTotals.set(last, (outTotals.get(last) || 0) + 1);
    }
  });
  
  // ensure every source/target has a node index & x‑column
  [...linkCounts.keys()].forEach((k) => {
    const [s, t] = k.split("||");
    idxOf(s, COLUMN_X[s] ?? COLUMN_X.CLIENT);
    const tx = t.startsWith("Dropped") ? COLUMN_X.DROP : COLUMN_X[t] ?? COLUMN_X.DROP;
    idxOf(t, tx);
  });
  
  // build Sankey arrays
  const sArr = [],
    tArr = [],
    vArr = [],
    cArr = [],
    hoverArr = [];
  
  linkCounts.forEach((cnt, k) => {
    const [s, t] = k.split("||");
    const pct = ((cnt / outTotals.get(s)) * 100).toFixed(1);
    const si = labels.indexOf(s);
    const ti = labels.indexOf(t);
    let linkColor;
    if (t.startsWith("Dropped")) linkColor = rgba("#ef4444", 0.7);
    else if (t === "SubmitOrder") linkColor = rgba("#059669", 0.8);
    else linkColor = rgba(nodeColors[si], 0.6);
    sArr.push(si);
    tArr.push(ti);
    vArr.push(cnt);
    cArr.push(linkColor);
    hoverArr.push(`${s} → ${t}<br>${cnt} sessions (${pct}%)`);
  });
  
  return {
    type: "sankey",
    orientation: "h",
    arrangement: "snap",
    node: {
      label: labels,
      x: xs,
      y: ys, // vertical positioning for clients
      pad: 15,
      thickness: 20,
      color: nodeColors,
      line: { color: "rgba(255,255,255,0.2)", width: 2 },
      hovertemplate: "<b>%{label}</b><extra></extra>",
    },
    link: {
      source: sArr,
      target: tArr,
      value: vArr,
      customdata: hoverArr,
      color: cArr,
      line: { color: "rgba(255,255,255,0.1)", width: 0.5 },
      hovertemplate: "%{customdata}<extra></extra>",
    },
    valueformat: ".0f",
    valuesuffix: " sessions",
  };
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [clientFilter, setClientFilter] = useState("");
  
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
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
  
  useEffect(() => {
    if (!rows.length) {
      setData(null);
      return;
    }
    let filteredRows = rows;
    if (clientFilter.trim()) {
      const f = clientFilter.toLowerCase();
      filteredRows = filteredRows.filter((r) => {
        const keysLower = Object.keys(r).reduce((acc, k) => {
          acc[k.toLowerCase()] = k;
          return acc;
        }, {});
        const client = r[keysLower["strclientid"]] || "";
        return client.toLowerCase().includes(f);
      });
    }
    const sessions = parseSessions(filteredRows);
    sortAndCleanSessions(sessions);
    setData(buildSankeyData(sessions));
  }, [rows, clientFilter]);
  
  const summary = useMemo(() => {
    if (!data || !rows.length) return null;
    let filteredRows = rows;
    if (clientFilter.trim()) {
      const f = clientFilter.toLowerCase();
      filteredRows = filteredRows.filter((r) => {
        const keysLower = Object.keys(r).reduce((acc, k) => {
          acc[k.toLowerCase()] = k;
          return acc;
        }, {});
        const client = r[keysLower["strclientid"]] || "";
        return client.toLowerCase().includes(f);
      });
    }
    const sessions = parseSessions(filteredRows);
    sortAndCleanSessions(sessions);
    const totalSessions = sessions.size;
    let completedCount = 0;
    sessions.forEach(({ events }) => {
      if (events.includes("SubmitOrder")) completedCount++;
    });
    const droppedCount = totalSessions - completedCount;
    return {
      totalSessions,
      completed: completedCount,
      dropped: droppedCount,
      pctCompleted: totalSessions ? ((completedCount / totalSessions) * 100).toFixed(1) : 0,
      pctDropped: totalSessions ? ((droppedCount / totalSessions) * 100).toFixed(1) : 0,
    };
  }, [data, rows, clientFilter]);
  
  // Calculate dynamic height based on number of unique clients
  const chartHeight = useMemo(() => {
    if (!data) return 800;
    const clientCount = data.node.label.filter(label => 
      !EVENT_ORDER.includes(label) && !label.startsWith('Dropped')
    ).length;
    return Math.max(800, Math.min(1200, clientCount * 25 + 400));
  }, [data]);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 text-slate-100 relative overflow-hidden p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* header */}
        <header className="mb-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Client Journey Visualization
          </h1>
          <p className="text-slate-400 mt-1">
            A Sankey Chart Analysis of User Flows
          </p>
        </header>
        
        {/* upload + filter */}
        <section className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl flex flex-wrap gap-4 items-center">
          <label className="relative cursor-pointer group">
            <input type="file" accept=".xls,.xlsx" onChange={handleUpload} className="sr-only" />
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg cursor-pointer">
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
          <section className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="text-red-400 text-xl">⚠️</div>
              <p className="text-red-300 font-mono">{error}</p>
            </div>
          </section>
        )}
        
        {/* summary stats */}
        {summary && (
          <section className="bg-white/10 rounded-xl p-6 border border-white/20 shadow-md flex flex-wrap gap-6 justify-center">
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-400">
                {summary.totalSessions.toLocaleString()}
              </div>
              <div>Total Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-400">
                {summary.completed.toLocaleString()} ({summary.pctCompleted}%)
              </div>
              <div>Completed (SubmitOrder)</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-red-400">
                {summary.dropped.toLocaleString()} ({summary.pctDropped}%)
              </div>
              <div>Dropped</div>
            </div>
          </section>
        )}
        
        {/* sankey chart */}
        <section className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl">
          {data ? (
            <div className="overflow-auto max-h-[900px] border border-white/10 rounded-lg bg-slate-800/50">
              <Plot
                data={[data]}
                layout={{
                  font: {
                    size: 11,
                    color: "#f8fafc",
                    family: "Inter, system-ui, sans-serif",
                  },
                  paper_bgcolor: "rgba(30, 41, 59, 0.8)",
                  plot_bgcolor: "rgba(0,0,0,0)",
                  margin: { l: 120, r: 120, t: 80, b: 40 },
                  width: 1600,
                  height: chartHeight,
                  title: {
                    text: "🔄 Client Journey Analytics Dashboard",
                    font: { size: 24, color: "#f1f5f9", family: "Inter, system-ui, sans-serif" },
                    x: 0.5,
                    xanchor: "center",
                    y: 0.95,
                  },
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
                  showlegend: false,
                }}
                config={{ 
                  responsive: false, 
                  displayModeBar: true, 
                  displaylogo: false,
                  modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
                  scrollZoom: true
                }}
                style={{ minWidth: "1600px", height: `${chartHeight}px` }}
              />
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-lg mb-2">Ready to analyze your data</p>
              <p className="text-sm">Upload an Excel file to generate the interactive Sankey diagram</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}