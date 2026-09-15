import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PopupApp } from "../../popup-app";
import "../../app.css";

const container = document.querySelector("#root");

if (container === null) throw new Error("The #root element is missing from index.html.");

createRoot(container).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
