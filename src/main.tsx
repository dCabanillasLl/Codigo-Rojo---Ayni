import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./AppContext";
import { LanguageProvider } from "./lib/language";
import "./index.css";
import "./maps.css";
import "./photos.css";
import "./nearby-filters.css";
import "./reputation.css";

if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .catch(error => console.warn('No se pudo preparar la aplicación sin conexión:', error.name));
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider><AppProvider><App /></AppProvider></LanguageProvider>
  </React.StrictMode>,
);
