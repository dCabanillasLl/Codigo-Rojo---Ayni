import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./AppContext";
import { LanguageProvider } from "./lib/language";
import "./index.css";
import "./maps.css";
import "./photos.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider><AppProvider><App /></AppProvider></LanguageProvider>
  </React.StrictMode>,
);
