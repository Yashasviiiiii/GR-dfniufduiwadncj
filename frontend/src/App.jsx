import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useApi } from "./utils.js";
import Decision from "./Decision.jsx";
import Accuracy from "./Accuracy.jsx";

export default function App() {
  const { data: m, err } = useApi("/api/metrics"); // loaded once, shared with both pages

  return (
    <div className="app">
      <div className="top">
        <h1>UK day-ahead wind forecast</h1>
        <div className="tabs">
          <NavLink to="/decision">Decision</NavLink>
          <NavLink to="/accuracy">Accuracy</NavLink>
        </div>
        {!m && !err && <span className="small">Loading Elexon data (first load can take a few seconds)...</span>}
      </div>

      {err && <div className="warn">Could not load accuracy metrics: {err}</div>}

      <Routes>
        <Route path="/decision" element={<Decision m={m} />} />
        <Route path="/accuracy" element={m?.overall ? <Accuracy m={m} /> : <div className="card">Loading...</div>} />
        <Route path="*" element={<Navigate to="/decision" replace />} />
      </Routes>
    </div>
  );
}