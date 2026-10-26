import { useState } from "react";
import {
  ComposedChart, Area, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { FIRST, LAST, hhmm, stamp, mw, fmt, useApi } from "./utils.js";

export default function Decision({ m }) {
  const [date, setDate] = useState("2026-01-15");
  const { data, err } = useApi(`/api/forecast?date=${date}`);
  const rows = (Array.isArray(data) ? data : []).map((r) => ({ ...r, t: hhmm(r.time), band: [r.lo, r.hi] }));
  const pubs = Array.isArray(data) ? [...new Set(data.map((r) => r.publishTime))].sort() : [];
  const noActual = rows.filter((r) => r.actual === null).length;

  const validRows = rows.filter((r) => r.actual !== null);
  const dayMae = validRows.length
    ? Math.round(validRows.reduce((acc, r) => acc + Math.abs(r.actual - r.forecast), 0) / validRows.length)
    : null;
  const dayBias = validRows.length
    ? Math.round(validRows.reduce((acc, r) => acc + (r.actual - r.forecast), 0) / validRows.length)
    : null;

  return (
    <div className="page">
      <div className="row">
        <div className="card">
          <h3>Delivery day</h3>
          <input type="date" value={date} min={FIRST} max={LAST}
            onChange={(e) => e.target.value >= FIRST && e.target.value <= LAST && setDate(e.target.value)} />
        </div>
        <div className="card">
          <h3>Day accuracy</h3>
          {dayMae !== null ? (
            <>
              <b>{mw(dayMae)} MW</b> miss {m?.overall && <small style={{ color: "#6b7280" }}> (Jan avg: {mw(m.overall.mae)} MW)</small>}
              <br />
              <small style={{ color: dayBias < 0 ? "#b45309" : "#15803d", fontWeight: 500 }}>
                Bias: {dayBias > 0 ? `+${mw(dayBias)}` : mw(dayBias)} MW ({dayBias < 0 ? "Over-forecast" : "Under-forecast"})
              </small>
            </>
          ) : (
            <span className="small">-</span>
          )}
        </div>
        <div className="card plan">
          {m?.overall
            ? <><b>{mw(-m.overall.p10_err)} MW</b> less wind is the 90th-percentile shortfall — plan your backup procurement accordingly.</>
            : "Loading..."}
          <br /><small>From the 10th percentile of past errors (actual - forecast), Jan 2026.</small>
        </div>
        <div className="card">
          <h3>Forecast used</h3>
          {pubs.length === 0 ? "-" : <>
            Published {stamp(pubs[0])}{pubs.length > 1 && ` to ${stamp(pubs[pubs.length - 1])}`} (UK time)
            <br /><small>Latest run before the 09:00 cutoff on the day before</small>
          </>}
        </div>
      </div>

      {err && <div className="warn">Could not load this day: {err}</div>}
      {data && data.length === 0 && <div className="warn">No forecast data for this day.</div>}
      {noActual > 0 && <div className="warn">Actual wind is missing for {noActual} hour(s) on this day (shown as gaps).</div>}

      <div className="card chart">
        <h3>Wind generation on {date}: decision-time forecast vs actual (MW), shaded = forecast + P10..P90 of past error</h3>
        <div className="chart-body">
          <ResponsiveContainer>
            <ComposedChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" interval={1} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={fmt} />
              <Legend />
              <Area dataKey="band" name="Likely range (80%)" stroke="none" fill="#93c5fd" fillOpacity={0.5} />
              <Line dataKey="forecast" name="Forecast" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              <Line dataKey="actual"   name="Actual"   stroke="#dc2626" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
