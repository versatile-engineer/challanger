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

// Service worker'ni ro'yxatdan o'tkazamiz (offline + o'rnatish uchun)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW ishlamasa — jim o'tamiz */
    });
  });
}
