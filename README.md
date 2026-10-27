# UK day-ahead wind forecast: decision and accuracy

A web app for a UK energy utility buying power in the day-ahead market. For each delivery day in January 2026 it provides:

1. **Decision tab:** the latest wind forecast available at decision time (09:00 UK on day D-1), plotted against actual wind with a shaded P10–P90 error band, 30-minute settlement period alignment, and an actionable "plan for up to X MW less wind" procurement buffer.
2. **Accuracy tab:** quantitative error evaluation including bias, MAE, RMSE, nMAE, percentiles, breakdowns by hour of day, forecast horizon, and wind level terciles (low/mid/high), distribution histogram, and benchmarks against persistence and look-ahead forecasts.

Data: Elexon BMRS only, national wind (`FUELHH` actuals with `fuelType=WIND`, `WINDFOR` forecasts). No API key needed.

**Live app:** `<add Heroku/Vercel URL here>`

## Architecture & Implementation

- **Backend (Python / FastAPI):** Fully asynchronous with `httpx` and `asyncio.gather` for parallel, non-blocking fetching of actuals and forecast streams from Elexon. Warmed automatically in the background on startup via FastAPI `lifespan`.
- **Frontend (React / Vite):** Responsive UI built with Recharts, providing interactive time-series plots, tooltips, and breakdown tables.

## Files

```
backend/
  main.py            Async API, data loading, cutoff logic, and accuracy analysis
  test_cutoff.py     pytest: verifies forecasts published after cutoff are never used
  requirements.txt   Python dependencies (FastAPI, uvicorn, httpx, numpy)
frontend/
  src/App.jsx        Main router and layout
  src/Decision.jsx   Decision view (latest forecast vs actual, error band, procurement buffer)
  src/Accuracy.jsx   Accuracy analytics (KPIs, hourly/horizon/wind-level breakdowns, benchmarks)
  src/utils.js       Shared date/time, formatting, and API utilities
  src/App.css        Styles
  vercel.json        Vercel rewrite configuration
Dockerfile           Multi-stage build serving frontend & backend from a single container
run.sh               Unified local run script
```

## Run locally

**All-in-one script:**

```bash
chmod +x run.sh
./run.sh          # runs backend (port 8000) and frontend (port 5173) concurrently
./run.sh --prod   # builds frontend and serves everything via Python at http://localhost:8000
```

**Python + npm** (two terminals):

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000
```
```bash
cd frontend
npm install
npm run dev          # Vite dev server, proxies /api calls to port 8000
```

Or build once and let Python serve everything at http://localhost:8000:
`cd frontend && npm install && npm run build`, then start uvicorn as above.

**Docker:**

```bash
docker build -t app .
docker run -p 8000:8000 app      # open http://localhost:8000
```

The container reads `$PORT` (default 8000). Cache warms asynchronously on launch.

**Tests:** `cd backend && pip install pytest && pytest`

## Assumptions & Domain Context

- **Decision time:** 09:00 Europe/London on day D-1 (aligning with day-ahead auction closure). For each target time, the forecast with the latest `publishTime <= 09:00 D-1` is selected. Forecasts published after the cutoff are never used for day-ahead decisions.
- **Scope:** Purchase decisions made in January 2026, covering delivery days 2 Jan to 1 Feb 2026 (31 days).
- **Settlement & resolution:** UK electricity markets settle in 30-minute settlement periods (`FUELHH`). `WINDFOR` forecasts publish at hourly targets, so comparisons are made strictly on the hour across all 744 target hours in the month without interpolation.
- **Error convention:** `Error = Actual - Forecast`. Negative error indicates an over-forecast (shortfall in wind, requiring backup procurement).
- **Uncertainty band:** Shaded range computed as forecast + empirical P10 and P90 of historical signed errors across January 2026, floored at 0 MW.
- **Wind level breakdown:** Accuracy categorized into low, mid, and high wind regimes using terciles of decision-time forecasts.
- **Persistence baseline:** Compares against generation 24 hours prior (a standard benchmark, though generous for evening hours).
- **Data integrity:** Data is fetched live from Elexon and cached in memory. No synthetic filling or interpolation; missing data points are explicitly flagged in the UI.

## AI tools

AI tools were used to assist with developing this application: Antigravity.