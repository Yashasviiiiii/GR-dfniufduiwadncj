# Wind forecast decision-time app (backend). Constants first, no env vars.
import threading
import requests
import numpy as np
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"  # Elexon BMRS API
CUTOFF_HOUR = 9                    # day-ahead decision time: 09:00 Europe/London on D-1
FIRST_DAY, N_DAYS = date(2026, 1, 2), 31   # delivery days 2 Jan .. 1 Feb 2026
LONDON = ZoneInfo("Europe/London")
CACHE, MISSING = {}, {}            # day -> hourly rows / day -> counts of missing points
HORIZONS = ["<24h", "24-30h", "30-36h", "36h+"]  # forecast horizon buckets (hours)
LAST_DAY = FIRST_DAY + timedelta(days=N_DAYS - 1)
DIST = Path(__file__).parent.parent / "frontend" / "dist"  # built React app


def get(endpoint, params):
    """Call the Elexon API (30s timeout, one retry). Returns a list of rows."""
    for attempt in range(2):
        try:
            r = requests.get(f"{BASE}/{endpoint}", params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if attempt == 1:
                raise  # second failure: let the caller skip this day


def to_dt(s):
    """Parse an Elexon timestamp like '2026-01-14T07:30:00Z' into an aware UTC datetime."""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def iso(t):
    """Format a datetime as an Elexon-style UTC string."""
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pick_forecast(rows, cutoff):
    """For each startTime keep the row with the latest publishTime <= cutoff.
    cutoff must be a timezone-aware datetime. Targets with no such row are absent."""
    best = {}
    for r in rows:
        if to_dt(r["publishTime"]) > cutoff:
            continue  # published after the decision time: never usable
        t = r["startTime"]
        if t not in best or to_dt(r["publishTime"]) > to_dt(best[t]["publishTime"]):
            best[t] = r
    return best


def load_day(d):
    """Hourly rows for delivery day d: forecast known at 09:00 London on D-1 vs actual."""
    if d in CACHE:
        return CACHE[d]
    cutoff = datetime.combine(d - timedelta(days=1), time(CUTOFF_HOUR), LONDON).astimezone(timezone.utc)
    day_start = datetime.combine(d, time(0), LONDON).astimezone(timezone.utc)
    # Actuals for D-1 and D (D-1 is only needed for the persistence baseline)
    act = get("FUELHH/stream", {"settlementDateFrom": str(d - timedelta(days=1)),
                                "settlementDateTo": str(d), "fuelType": "WIND"})
    # Forecasts published from cutoff-48h until the delivery day starts (the part after
    # the cutoff is used ONLY for the look-ahead comparison, never for the decision)
    fc = get("WINDFOR/stream", {"publishDateTimeFrom": iso(cutoff - timedelta(hours=48)),
                                "publishDateTimeTo": iso(day_start)})
    fc = [r for r in fc if r["startTime"].startswith(str(d))]  # targets on day D (UTC date = UK date in January)
    decision = pick_forecast(fc, cutoff)      # what the trader could see at 09:00 on D-1
    latest = pick_forecast(fc, day_start)     # latest forecast before delivery starts (look-ahead)
    actual = {r["startTime"]: r["generation"] for r in act}
    rows = [{"time": t, "forecast": decision[t]["generation"], "actual": actual.get(t),  # None if missing
             "publishTime": decision[t]["publishTime"],
             "latest": latest[t]["generation"] if t in latest else None,
             "persist": actual.get(iso(to_dt(t) - timedelta(hours=24)))}  # actual 24h earlier
            for t in sorted(decision)]  # WINDFOR is hourly, so only on-the-hour points exist
    # count gaps instead of hiding them: actual hours without forecast, forecasts without actual
    MISSING[d] = {"no_forecast": sum(1 for t in actual if t.startswith(str(d)) and t[14:16] == "00" and t not in decision),
                  "no_actual": sum(1 for t in decision if t not in actual)}
    CACHE[d] = rows
    return rows


def load_all():
    """Load all delivery days in parallel. Returns (rows, list of days that failed)."""
    days = [FIRST_DAY + timedelta(i) for i in range(N_DAYS)]

    def safe(d):
        try:
            return load_day(d)
        except Exception:
            return None  # day skipped and reported, nothing invented

    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(safe, days))
    failed = [str(d) for d, r in zip(days, results) if r is None]
    return [r for x in results if x for r in x], failed


def stats(rows):
    """Error stats of decision-time forecasts. Error = actual - forecast."""
    e = np.array([r["actual"] - r["forecast"] for r in rows], float)
    a = np.array([r["actual"] for r in rows], float)
    ae = np.abs(e)
    return {"n": len(e), "bias": e.mean(), "mae": ae.mean(), "rmse": np.sqrt((e ** 2).mean()),
            "nmae": ae.mean() / a.mean(), "p50_abs": np.percentile(ae, 50),
            "p90_abs": np.percentile(ae, 90), "p95_abs": np.percentile(ae, 95),
            "p10_err": np.percentile(e, 10), "p90_err": np.percentile(e, 90)}


def group(rows, keyfn, order):
    """Split rows by keyfn, return n / bias / MAE per group (in the given order)."""
    g = {}
    for r in rows:
        g.setdefault(keyfn(r), []).append(r)
    out = {}
    for k in order:
        if k in g:
            s = stats(g[k])
            out[k] = {"n": s["n"], "bias": s["bias"], "mae": s["mae"]}
    return out


def mae_of(rows, key):
    """MAE of actual vs the chosen column (forecast / latest / persist), skipping missing values."""
    rows = [r for r in rows if r[key] is not None]
    return {"n": len(rows), "mae": float(np.mean([abs(r["actual"] - r[key]) for r in rows]))}


def analyze(rows):
    """All Step 3 results as one dict."""
    rows = sorted((r for r in rows if r["actual"] is not None), key=lambda r: r["time"])
    e = np.array([r["actual"] - r["forecast"] for r in rows], float)
    skew = ((e - e.mean()) ** 3).mean() / e.std() ** 3
    # lag-1 autocorrelation only over pairs that are exactly 1 hour apart (no gap-filling)
    pairs = [(e[i], e[i + 1]) for i in range(len(e) - 1)
             if to_dt(rows[i + 1]["time"]) - to_dt(rows[i]["time"]) == timedelta(hours=1)]
    lag1 = np.corrcoef(*zip(*pairs))[0, 1]
    # wind level buckets use the FORECAST (known at decision time): terciles of all forecasts
    t1, t2 = np.percentile([r["forecast"] for r in rows], [33.3, 66.7])
    level = lambda r: "low" if r["forecast"] < t1 else "mid" if r["forecast"] < t2 else "high"
    hours = lambda r: (to_dt(r["time"]) - to_dt(r["publishTime"])).total_seconds() / 3600
    horizon = lambda r: HORIZONS[0 if hours(r) < 24 else 1 if hours(r) < 30 else 2 if hours(r) < 36 else 3]
    days = {}
    for r in rows:
        days.setdefault(r["time"][:10], []).append(r)
    worst = sorted(((d, stats(v)["mae"], len(v)) for d, v in days.items()), key=lambda x: -x[1])[:5]
    return {"overall": stats(rows), "skew": skew, "lag1_autocorr": lag1,
            "by_hour": group(rows, lambda r: to_dt(r["time"]).astimezone(LONDON).hour, range(24)),
            "by_horizon": group(rows, horizon, HORIZONS),
            "by_level": group(rows, level, ["low", "mid", "high"]),
            "level_thresholds_mw": [t1, t2], "worst5_days": worst,
            "horizon_range_h": [min(map(hours, rows)), max(map(hours, rows))],
            "decision_mae": mae_of(rows, "forecast"), "lookahead_mae": mae_of(rows, "latest"),
            "persistence_mae": mae_of(rows, "persist"),
            # same-subset comparison so the three MAEs are like-for-like
            "decision_mae_same_rows_as_persistence": mae_of([r for r in rows if r["persist"] is not None], "forecast")}


# ---------------- API ----------------
@asynccontextmanager
async def lifespan(app):
    threading.Thread(target=load_all, daemon=True).start()  # warm the cache in the background
    yield


app = FastAPI(lifespan=lifespan)


def all_data():
    """All rows that have both forecast and actual, plus the days that failed to load."""
    rows, failed = load_all()  # days already cached return instantly
    return [r for r in rows if r["actual"] is not None], failed


@app.get("/api/forecast")
def forecast(date: str):
    """Decision-time forecast vs actual for one delivery day, with a P10/P90 error band."""
    try:
        d = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    if not FIRST_DAY <= d <= LAST_DAY:
        raise HTTPException(400, f"date must be between {FIRST_DAY} and {LAST_DAY}")
    try:
        day = load_day(d)
    except Exception:
        raise HTTPException(503, f"Elexon data for {d} could not be loaded")
    rows, _ = all_data()
    if not rows:
        raise HTTPException(503, "No data loaded, cannot compute the error band")
    s = stats(rows)  # band = forecast + P10 / P90 of historical signed error (actual - forecast)
    return [{"time": r["time"], "forecast": r["forecast"], "actual": r["actual"],
             "publishTime": r["publishTime"], "lo": round(max(0, r["forecast"] + s["p10_err"]), 1),
             "hi": round(r["forecast"] + s["p90_err"], 1)} for r in day]


@app.get("/api/metrics")
def metrics():
    """Every accuracy number from the analysis, plus histogram and missing-data report."""
    rows, failed = all_data()
    if not rows:
        raise HTTPException(503, "No data loaded")
    counts, edges = np.histogram([r["actual"] - r["forecast"] for r in rows], bins=20)
    out = analyze(rows)
    out["histogram"] = [{"from": float(edges[i]), "to": float(edges[i + 1]), "n": int(counts[i])} for i in range(20)]
    out["missing_days"] = failed  # days that could not be loaded at all
    out["missing_points"] = {str(d): m for d, m in sorted(MISSING.items()) if any(m.values())}
    return out


if DIST.exists():  # serve the built frontend at "/" (must be mounted last)
    app.mount("/", StaticFiles(directory=DIST, html=True), name="static")