import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./App.css";

// HashRouter keeps pages at /#/decision, so the Python server needs no extra routes
createRoot(document.getElementById("root")).render(<HashRouter><App /></HashRouter>);