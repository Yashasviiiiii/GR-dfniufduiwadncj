import {
  ComposedChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { mw } from "./utils.js";

// ── Custom tooltips ────────────────────────────────────────────────────────
function HourTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-title">Target Hour: {d.hour} UK</div>
      <div style={{ color: "#93c5fd" }}>Avg Miss (MAE): <b>{mw(d.mae)} MW</b></div>
      <div style={{ color: "#fcd34d" }}>
        Directional Bias: <b>{d.bias > 0 ? `+${mw(d.bias)}` : mw(d.bias)} MW</b>
        <div className="tooltip-note">{d.bias < 0 ? "Forecast was higher than actual (Over-forecast)" : "Forecast was lower than actual"}</div>
      </div>
    </div>
  );
}

function HorizonTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-title">Horizon: {d.name}</div>
      <div style={{ color: "#93c5fd" }}>Avg Miss (MAE): <b>{mw(d.mae)} MW</b></div>
      <div style={{ color: "#fcd34d" }}>
        Directional Bias: <b>{d.bias > 0 ? `+${mw(d.bias)}` : mw(d.bias)} MW</b>
        <div className="tooltip-note">{d.bias < 0 ? "Consistent over-forecast" : "Under-forecast"}</div>
      </div>
    </div>
  );
}

function HistTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-title">Error range: {mw(d.from)} to {mw(d.to)} MW</div>
      <div>Frequency: <b>{d.n} hours</b> ({d.pct}% of month)</div>
      <div style={{ color: d.isShortfall ? "#fbbf24" : "#34d399", fontWeight: 600, marginTop: 2 }}>
        {d.isShortfall ? "⚠️ Wind Shortfall (Actual < Forecast)" : "✅ Wind Surplus (Actual ≥ Forecast)"}
      </div>
    </div>
  );
}

// ── Accuracy page ──────────────────────────────────────────────────────────
export default function Accuracy({ m }) {
  if (!m?.overall) return <div className="card">Loading...</div>;
  const o = m.overall;

  const biasDir    = o.bias < 0 ? "Over-forecast" : "Under-forecast";
  const biasBadge  = o.bias < 0 ? "badge-amber" : "badge-green";
  const biasVal    = (o.bias > 0 ? "+" : "") + mw(o.bias) + " MW";
  const biasDesc   = `${biasDir}: actual wind was ${mw(Math.abs(o.bias))} MW ${o.bias < 0 ? "below" : "above"} the forecast on average`;
  const kpis = [
    { title: "Bias",          val: biasVal,         badge: biasDir, badgeCls: biasBadge, desc: biasDesc },
    { title: "MAE (Avg Miss)",val: mw(o.mae) + " MW",                                                              desc: "Average absolute difference between actual & forecast" },
    { title: "RMSE",          val: mw(o.rmse) + " MW",                                                             desc: "Root Mean Square Error (heavily penalises large misses)" },
    { title: "nMAE",          val: (o.nmae * 100).toFixed(1) + "%",                                                desc: "Normalized error (MAE divided by mean actual wind)" },
    { title: "P90 Abs Error", val: mw(o.p90_abs) + " MW",                                                         desc: "9 out of 10 hours have an error smaller than this" },
  ];

  const hourData = Object.entries(m.by_hour).map(([h, v]) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    mae:  Math.round(v.mae),
    bias: Math.round(v.bias),
  }));

  const horizonLabels = { "<24h": "<24h (D-1 eve)", "24-30h": "24–30h (D morning)", "30-36h": "30–36h (D afternoon)", "36h+": "36h+ (D night)" };
  const horizonData = Object.entries(m.by_horizon).map(([k, v]) => ({
    name: horizonLabels[k] || k,
    mae:  Math.round(v.mae),
    bias: Math.round(v.bias),
  }));

  const totalShortfall = m.histogram.filter((b) => (b.from + b.to) / 2 < 0).reduce((acc, b) => acc + b.n, 0);
  const shortfallPct   = Math.round((totalShortfall / o.n) * 100);
  const histData = m.histogram.map((b) => {
    const mid = Math.round((b.from + b.to) / 2);
    return { from: Math.round(b.from), to: Math.round(b.to), mid, label: mid > 0 ? `+${mw(mid)}` : mw(mid), n: b.n, pct: ((b.n / o.n) * 100).toFixed(1), isShortfall: mid < 0 };
  });

  const benchmarks = [
    { name: "Decision-time forecast (09:00 D-1)",       mae: m.decision_mae.mae,    fill: "#2563eb", badgeCls: "badge-green", badge: `${Math.round(((m.persistence_mae.mae - m.decision_mae.mae) / m.persistence_mae.mae) * 100)}% better than persistence baseline` },
    { name: "Look-ahead (latest before delivery)",       mae: m.lookahead_mae.mae,   fill: "#0284c7", badgeCls: "badge-blue",  badge: `${Math.round(((m.decision_mae.mae - m.lookahead_mae.mae) / m.decision_mae.mae) * 100)}% extra gain with intraday weather updates` },
    { name: "Persistence baseline (actual 24h earlier)", mae: m.persistence_mae.mae, fill: "#94a3b8", badgeCls: "badge-gray",  badge: "Standard reference baseline" },
  ];
  const maxBench = Math.max(...benchmarks.map((b) => b.mae));
  const gaps = Object.keys(m.missing_points).length;

  const YAXIS_PROPS = { fontSize: 10, tick: { fill: "#6b7280" }, domain: [-2600, 2600], ticks: [-2000, -1000, 0, 1000, 2000] };

  return (
    <div className="page">
      {m.missing_days.length > 0 && (
        <div className="warn">Could not load {m.missing_days.length} day(s): {m.missing_days.join(", ")}. All numbers below exclude them.</div>
      )}
      {gaps > 0 && (
        <div className="warn">Some hours have missing data (not filled in): {Object.entries(m.missing_points).map(([d, v]) => `${d} (${v.no_forecast} no forecast, ${v.no_actual} no actual)`).join("; ")}.</div>
      )}

      {/* KPI row */}
      <div className="row">
        {kpis.map((k) => (
          <div className="card kpi" key={k.title}>
            <div className="kpi-top">
              <span style={{ fontSize: "12px", color: "#4b5563", fontWeight: 600 }}>{k.title}</span>
              {k.badge && <span className={`badge ${k.badgeCls}`}>{k.badge}</span>}
            </div>
            <b>{k.val}</b>
            <small>{k.desc}</small>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="row grow">
        {/* Chart 1 – Error by hour of day */}
        <div className="card chart">
          <h3><span>Error by hour of day (UK time)</span></h3>
          <div className="card-subtitle">Bars = Average Error (MAE) &bull; Line = Systematic Bias</div>
          <div className="chart-body">
            <ResponsiveContainer>
              <ComposedChart data={hourData} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="hour" interval={2} fontSize={10} tick={{ fill: "#6b7280" }} />
                <YAxis {...YAXIS_PROPS} />
                <Tooltip content={<HourTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                <Bar  dataKey="mae"  name="Avg Miss (MAE)" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={16} />
                <Line dataKey="bias" name="Bias (Drift)"   stroke="#f59e0b" strokeWidth={2.2} dot={{ r: 2 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2 – Error by forecast horizon */}
        <div className="card chart">
          <h3><span>Error by forecast horizon</span></h3>
          <div className="card-subtitle">How uncertainty evolves from 09:00 D-1 auction to delivery</div>
          <div className="chart-body">
            <ResponsiveContainer>
              <ComposedChart data={horizonData} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" interval={0} fontSize={9} tick={{ fill: "#6b7280" }} />
                <YAxis {...YAXIS_PROPS} />
                <Tooltip content={<HorizonTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                <Bar  dataKey="mae"  name="Avg Miss (MAE)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Line dataKey="bias" name="Bias (Drift)"   stroke="#f59e0b" strokeWidth={2.2} dot={{ r: 3 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3 – Error distribution histogram */}
        <div className="card chart">
          <h3><span>Distribution of errors (actual - forecast)</span></h3>
          <div className="card-subtitle" style={{ display: "flex", gap: "6px" }}>
            <span className="badge badge-amber">Over-forecast (Shortfall): {shortfallPct}%</span>
            <span className="badge badge-green">Surplus: {100 - shortfallPct}%</span>
          </div>
          <div className="chart-body">
            <ResponsiveContainer>
              <BarChart data={histData} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" interval={2} fontSize={9} tick={{ fill: "#6b7280" }} />
                <YAxis fontSize={10} tick={{ fill: "#6b7280" }} unit="h" />
                <Tooltip content={<HistTooltip />} />
                <Bar dataKey="n" name="Hours" radius={[2, 2, 0, 0]}>
                  {histData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.isShortfall ? "#f59e0b" : "#10b981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Wind-level breakdown */}
      {m.by_level && (
        <div className="row">
          <div className="card" style={{ flex: 1 }}>
            <h3>Accuracy by wind level</h3>
            <div className="card-subtitle">Wind level terciles based on decision-time forecast</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#6b7280" }}>
                  <th style={{ textAlign: "left",  padding: "4px 8px" }}>Level</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Hours</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>MAE (MW)</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Bias (MW)</th>
                </tr>
              </thead>
              <tbody>
                {["low", "mid", "high"].filter(k => m.by_level[k]).map(k => {
                  const v = m.by_level[k];
                  const labels = { low: "🟢 Low", mid: "🟡 Mid", high: "🔴 High" };
                  return (
                    <tr key={k} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{labels[k]}</td>
                      <td style={{ textAlign: "right", padding: "6px 8px", color: "#6b7280" }}>{v.n}</td>
                      <td style={{ textAlign: "right", padding: "6px 8px" }}>{mw(v.mae)}</td>
                      <td style={{ textAlign: "right", padding: "6px 8px", color: v.bias < 0 ? "#b45309" : "#15803d" }}>
                        {v.bias > 0 ? "+" : ""}{mw(v.bias)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {m.level_thresholds_mw && (
              <div style={{ marginTop: "6px", fontSize: "11px", color: "#9ca3af" }}>
                Thresholds: Low &lt; {mw(m.level_thresholds_mw[0])} MW · Mid &lt; {mw(m.level_thresholds_mw[1])} MW · High ≥ {mw(m.level_thresholds_mw[1])} MW
              </div>
            )}
          </div>
        </div>
      )}

      {/* Benchmark row */}
      <div className="row">
        <div className="card" style={{ flex: 2 }}>
          <h3>Forecast Benchmarking (MAE comparison)</h3>
          <div style={{ marginTop: "6px" }}>
            {benchmarks.map((b) => (
              <div className="bench-item" key={b.name}>
                <div className="bench-header">
                  <span><b>{b.name}</b>: {mw(b.mae)} MW</span>
                  <span className={`badge ${b.badgeCls}`}>{b.badge}</span>
                </div>
                <div className="bench-bar-track">
                  <div className="bench-bar-fill" style={{ width: `${(b.mae / maxBench) * 100}%`, background: b.fill }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card small" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <b style={{ color: "#374151", marginBottom: "4px" }}>Sample & Coverage</b>
          Based on {o.n} hourly points across 31 January 2026 delivery days.
          WINDFOR forecasts are hourly, compared strictly at the start of each target hour against Elexon actuals without interpolation.
        </div>
      </div>
    </div>
  );
}
