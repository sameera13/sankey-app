import React, { useState, useMemo } from "react";
import Plot from "react-plotly.js";
import * as XLSX from "xlsx";
/* --------------------------------------------------
 * CANONICAL ORDER & COLUMN POSITIONS
 * --------------------------------------------------*/
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
  "SubmitOrder", // terminal
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
/* --------------------------------------------------
 * ENHANCED COLOR PALETTE – Modern gradient-inspired
 * --------------------------------------------------*/
const NODE_PALETTE = {
  DEFAULT: "#64748b", // slate‑500
  CLIENT: "#8b5cf6", // violet‑500 - Starting point
  CreateSession: "#6366f1", // indigo‑500 - Session creation
  ValidateAddress: "#3b82f6", // blue‑500 - Validation
  GetQualifiedProducts: "#06b6d4", // cyan‑500 - Product discovery
  CreateOrder: "#10b981", // emerald‑500 - Order creation
  SaveOrderProducts: "#22c55e", // green‑500 - Product saving
  EstimateFirstBill: "#84cc16", // lime‑500 - Billing
  GetDueDates: "#eab308", // yellow‑500 - Date management
  SetDueDates: "#f59e0b", // amber‑500 - Date setting
  CreditCheck: "#f97316", // orange‑500 - Credit verification
  SubmitOrder: "#059669", // emerald‑600 - Success completion
  DROP: "#ef4444", // red‑500 - Drop-offs
};

const GRADIENT_BACKGROUNDS = {
  primary: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  secondary: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  success: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  warning: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  error: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
};
export default function App() {
  const [rows, setRows] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  /* ---------------------- Excel upload ---------------------- */
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
  /* ---------------------- Build Sankey ---------------------- */
  useMemo(() => {
    if (!rows.length) return;
    const cell = (r, key) => {
      const col = Object.keys(r).find((h) => h.toLowerCase() === key);
      return col ? String(r[col]).trim() : "";
    };
    const sessions = new Map();
    rows.forEach((r) => {
      const client = cell(r, "strclientid");
      const sid = cell(r, "strsessionid");
      let evt = cell(r, "methodname");
      if (!client || !sid || !evt) return;
      
      // Filter out SAVESMARTCART|*|SUCCESS events
      if (evt.includes("SAVESMARTCART") && evt.includes("SUCCESS")) return;
      
      evt = evt.toLowerCase() === "submitorder" ? "SubmitOrder" : evt;
      evt = evt.toLowerCase() === "setduedate" ? "SetDueDates" : evt;
      sessions.set(sid, sessions.get(sid) || { client, events: [] });
      sessions.get(sid).events.push(evt);
    });
    /* sort + deduplicate */
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
    /* nodes & links */
    const labels = [], xs = [], ys = [], nodeColors = [];
    const idxOf = (lbl, x) => {
      const i = labels.indexOf(lbl);
      if (i !== -1) return i;
      labels.push(lbl);
      xs.push(x);
      ys.push(0);
      nodeColors.push(NODE_PALETTE[lbl] || NODE_PALETTE.DEFAULT);
      return labels.length - 1;
    };
    const linkCounts = new Map();
    const outTotals = new Map();
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
    /* register nodes */
    [...linkCounts.keys()].forEach((k) => {
      const [s, t] = k.split("||");
      idxOf(s, COLUMN_X[s] ?? COLUMN_X.CLIENT);
      const tx = t.startsWith("Dropped") ? COLUMN_X.DROP : COLUMN_X[t] ?? COLUMN_X.DROP;
      idxOf(t, tx);
    });
    /* distribute y - improved vertical positioning */
    const buckets = {};
    labels.forEach((_, i) => {
      const x = xs[i];
      if (!buckets[x]) buckets[x] = [];
      buckets[x].push(i);
    });
    
    Object.entries(buckets).forEach(([x, indices]) => {
      // Sort nodes by their importance/flow volume for better visual hierarchy
      indices.sort((a, b) => {
        const aLabel = labels[a];
        const bLabel = labels[b];
        
        // Prioritize main flow events over dropped events
        if (aLabel.startsWith('Dropped') && !bLabel.startsWith('Dropped')) return 1;
        if (!aLabel.startsWith('Dropped') && bLabel.startsWith('Dropped')) return -1;
        
        // Keep EVENT_ORDER for main events
        const aOrder = EVENT_ORDER.indexOf(aLabel);
        const bOrder = EVENT_ORDER.indexOf(bLabel);
        if (aOrder !== -1 && bOrder !== -1) return aOrder - bOrder;
        if (aOrder !== -1) return -1;
        if (bOrder !== -1) return 1;
        
        return aLabel.localeCompare(bLabel);
      });
      
      // Distribute vertically with better spacing
      indices.forEach((nodeIdx, i) => {
        if (indices.length === 1) {
          ys[nodeIdx] = 0.5; // Center single nodes
        } else {
          // Use more of the vertical space with padding
          const padding = 0.1;
          const usableSpace = 1 - (2 * padding);
          ys[nodeIdx] = padding + (i * usableSpace) / (indices.length - 1);
        }
      });
    });
    /* enhanced links with gradient-like colors */
    const rgba = (hex, a = 0.6) =>
      `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
    
    const sArr = [], tArr = [], vArr = [], lArr = [], cArr = [];
    linkCounts.forEach((cnt, k) => {
      const [s, t] = k.split("||");
      const pct = ((cnt / outTotals.get(s)) * 100).toFixed(1);
      const si = labels.indexOf(s);
      const ti = labels.indexOf(t);
      
      // Enhanced link coloring based on target
      let linkColor;
      if (t.startsWith("Dropped")) {
        linkColor = rgba("#ef4444", 0.7); // Red for drops
      } else if (t === "SubmitOrder") {
        linkColor = rgba("#059669", 0.8); // Strong green for success
      } else {
        linkColor = rgba(nodeColors[si], 0.6); // Source color
      }
      
      sArr.push(si);
      tArr.push(ti);
      vArr.push(cnt);
      lArr.push(`${s} → ${t}<br>${cnt} sessions (${pct}%)`);
      cArr.push(linkColor);
    });
    setData({
      type: "sankey",
      orientation: "h",
      node: { 
        label: labels, 
        x: xs, 
        y: ys, 
        pad: 25, 
        thickness: 35, 
        color: nodeColors,
        line: { color: "rgba(255,255,255,0.2)", width: 2 },
        hovertemplate: '<b>%{label}</b><br>Total Sessions: %{value}<extra></extra>'
      },
      link: { 
        source: sArr, 
        target: tArr, 
        value: vArr, 
        label: lArr, 
        color: cArr,
        line: { color: "rgba(255,255,255,0.1)", width: 0.5 },
        hovertemplate: '%{label}<extra></extra>'
      },
    });
  }, [rows]);
  /* UI */
  const uploadBtn =
    "file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm " +
    "file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500";
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 text-slate-100 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/2 -left-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-cyan-500/5 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>
      
      <div className="relative z-10 p-6 flex flex-col gap-6">
        {/* Header Section */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                Client Journey Analytics
              </h1>
              <p className="text-slate-400 mt-2">
                Visualize customer flow and identify optimization opportunities
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                Live Dashboard
              </div>
            </div>
          </div>
          
          {/* Upload Section */}
          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer group">
              <input 
                type="file" 
                accept=".xls,.xlsx" 
                onChange={handleUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl group-hover:shadow-purple-500/25">
                📁 Choose Excel File
              </div>
            </label>
            {rows.length > 0 && (
              <div className="bg-emerald-500/20 text-emerald-300 px-4 py-2 rounded-lg border border-emerald-500/30">
                ✅ {rows.length.toLocaleString()} records loaded
              </div>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="text-red-400 text-xl">⚠️</div>
              <p className="text-red-300 font-mono">{error}</p>
            </div>
          </div>
        )}

        {/* Chart Section */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl">
          {data ? (
            <div className="relative">
              {/* Chart Container */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <Plot
                  data={[data]}
                  layout={{
                    font: { size: 12, color: '#f8fafc', family: 'Inter, system-ui, sans-serif' },
                    paper_bgcolor: "rgba(0,0,0,0)",
                    plot_bgcolor: "rgba(0,0,0,0)",
                    margin: { l: 15, r: 15, t: 80, b: 20 },
                    title: {
                      text: "🔄 Client Journey Analytics Dashboard",
                      font: { size: 24, color: '#f1f5f9', family: 'Inter, system-ui, sans-serif' },
                      x: 0.5,
                      xanchor: 'center',
                      y: 0.95
                    },
                    annotations: [
                      {
                        text: "Flow visualization showing customer progression through service touchpoints",
                        x: 0.5,
                        y: 0.02,
                        xref: 'paper',
                        yref: 'paper',
                        xanchor: 'center',
                        yanchor: 'bottom',
                        showarrow: false,
                        font: { size: 11, color: '#94a3b8' }
                      }
                    ],
                    hovermode: 'closest',
                    dragmode: false
                  }}
                  style={{ width: "100%", height: "calc(100vh - 300px)" }}
                  config={{ 
                    responsive: true,
                    displayModeBar: true,
                    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'resetScale2d', 'pan2d', 'zoom2d', 'zoomIn2d', 'zoomOut2d'],
                    displaylogo: false,
                    toImageButtonOptions: {
                      format: 'png',
                      filename: 'client_journey_sankey',
                      height: 800,
                      width: 1200,
                      scale: 2
                    }
                  }}
                />
              </div>
              
              {/* Legend */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                  <span className="text-slate-300">Successful Flow</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-slate-300">Drop-off Points</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-slate-300">Process Steps</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span className="text-slate-300">Entry Points</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-slate-400 text-lg mb-2">Ready to analyze your data</p>
              <p className="text-slate-500 text-sm">Upload an Excel file to generate the interactive Sankey diagram</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}