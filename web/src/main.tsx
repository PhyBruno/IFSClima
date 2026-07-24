import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DemoGallery } from "./components/DemoGallery";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado em index.html");
}

// Rota única e estática (T5.4): sem router de verdade até F6 ter mais de uma
// tela real — uma checagem de pathname resolve sem adicionar dependência.
const RootComponent = window.location.pathname === "/__ui" ? DemoGallery : App;

createRoot(rootElement).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
);
