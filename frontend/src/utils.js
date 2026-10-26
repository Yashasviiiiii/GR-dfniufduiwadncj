import { useEffect, useState } from "react";
import axios from "axios";

export const FIRST = "2026-01-02";
export const LAST  = "2026-02-01"; // delivery days we have data for

const London = { timeZone: "Europe/London" }; // all times are shown in UK time

export const hhmm  = (iso) => new Date(iso).toLocaleTimeString("en-GB", { ...London, hour: "2-digit", minute: "2-digit" });
export const stamp = (iso) => new Date(iso).toLocaleString("en-GB",     { ...London, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const mw    = (x)   => Math.round(x).toLocaleString("en-GB");
export const fmt   = (v)   => Array.isArray(v) ? `${mw(v[0])} to ${mw(v[1])} MW` : `${mw(v)} MW`;

// Fetches JSON from the backend; re-runs whenever `url` changes.
// Returns { data, err } — data is null while loading or on error.
export function useApi(url) {
  const [s, setS] = useState({ data: null, err: null });
  useEffect(() => {
    let stale = false;
    setS({ data: null, err: null });
    axios.get(url)
      .then((r) => {
        if (stale) return;
        if (typeof r.data === "string")
          setS({ data: null, err: "Received non-JSON response from server" });
        else
          setS({ data: r.data, err: null });
      })
      .catch((e) => !stale && setS({ data: null, err: e.response?.data?.detail || e.message }));
    return () => { stale = true; };
  }, [url]);
  return s;
}
