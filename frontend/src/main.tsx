import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, getTheme } from "./theme";
import "./styles.css";

// Saqlangan mavzuni darhol qo'llaymiz (render'dan oldin)
applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
