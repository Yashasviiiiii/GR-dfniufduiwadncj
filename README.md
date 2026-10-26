# UK day-ahead wind forecast: decision and accuracy

A small web app for a UK energy utility buying power in the day-ahead market. For each delivery day in January 2026 it shows:

1. **Decision tab:** the latest wind forecast available at decision time (09:00 UK on the day before), against the actual wind, with an error band and a "plan for up to X MW less wind" figure.
2. **Accuracy tab:** how wrong that forecast has been (bias, MAE, RMSE, nMAE, percentiles, breakdowns by hour, horizon and wind level, histogram, and comparison with a persistence baseline and a look-ahead forecast).

Data: Elexon BMRS only, national wind (`FUELHH` actuals with `fuelType=WIND`, `WINDFOR` forecasts). No API key needed.

**Live app:** `<add Heroku/Vercel URL here>`

## Files

```
backend/
  main.py            API, data loading, cutoff logic and analysis (one file)
  test_cutoff.py     pytest: a forecast published after the cutoff is never used
  requirements.txt   Python dependencies
frontend/
  src/App.jsx        all UI (Decision and Accuracy pages, charts)
  src/main.jsx       React entry point
  src/App.css        styles
  index.html, vite.config.js, package.json
Dockerfile           builds the frontend, then one Python container serves API + UI
```

## Run locally

**All-in-one script:**

```bash
chmod +x run.sh
./run.sh          # runs backend (port 8000) and frontend (port 5173) together
./run.sh --prod   # builds frontend and serves everything via Python at http://localhost:8000
```

**Python + npm** (two terminals):

```
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000
```
```
cd frontend
npm install
npm run dev          # open the printed URL, /api calls go to port 8000
```

Or build once and let Python serve everything at http://localhost:8000:
`cd frontend && npm install && npm run build`, then start uvicorn as above.

**Docker:**

```
docker build -t app .
docker run -p 8000:8000 app      # open http://localhost:8000
```

The container reads `$PORT` (default 8000). The first load takes a few seconds while data is fetched from Elexon.

**Tests:** `cd backend && pip install pytest && pytest`

## Assumptions

- **Decision time:** 09:00 UK on day D-1 (the day-ahead auction closes around then). For each target hour, the forecast with the latest `publishTime` at or before the cutoff is used. Later forecasts are never used for the decision.
- **Scope:** purchase decisions made in January 2026, so delivery days 2 Jan to 1 Feb 2026 (31 days).
- **Error** = actual - forecast. Negative means the forecast was too high.
- **Hourly comparison:** `WINDFOR` forecasts are hourly while `FUELHH` actuals are half-hourly, so only on-the-hour points are compared (744 points). Half-hour actuals are not used.
- **Error band:** forecast plus the P10 and P90 of past signed errors over all 31 days (so it is in-sample), with the lower edge floored at 0. With about a month of data, percentiles are indicative only.
- **Persistence baseline** (actual 24h earlier) is generous: for late hours that actual is not known at 09:00.
- **No data is ever filled in or interpolated.** If a day fails to load or an hour is missing, the app says so.
- Data is fetched live from Elexon and cached in memory (no database, no data files).

## AI tools

AI tools were used to help build this project: Antigravity 