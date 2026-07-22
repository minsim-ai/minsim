if (import.meta.env.DEV) {
  import("react-grab/core")
    .then(({ init }) => {
      const api = init({
        activationMode: "toggle",
        activationKey: "Meta+g",
        allowActivationInsideInput: true,
        maxContextLines: 5,
      });
      api.setEnabled(true);
      api.setToolbarState({
        edge: "bottom",
        ratio: 0.9,
        collapsed: false,
        enabled: true,
      });
      (window as Window & { __REACT_GRAB__?: typeof api }).__REACT_GRAB__ = api;
    })
    .catch((error) => {
      console.warn("React Grab failed to load", error);
    });
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import "./styles.css";
import "./mobile.css";
import "./auth-theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
