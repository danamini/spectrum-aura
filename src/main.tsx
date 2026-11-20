import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "@fontsource/michroma/latin-400.css";
import "@fontsource/share-tech-mono/latin-400.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
