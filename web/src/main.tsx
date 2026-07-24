import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DemoGallery } from "./components/DemoGallery";
import { HistoryPage } from "./pages/HistoryPage";
import { QueryProvider } from "./providers/QueryProvider";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado em index.html");
}

// Rota única e estática (T5.4): sem router de verdade até F6 ter mais de uma
// tela real — uma checagem de pathname resolve sem adicionar dependência.
// F8 T8.6 estende a mesma checagem para `/historico` (agora uma tela real).
function resolveRootComponent() {
  switch (window.location.pathname) {
    case "/__ui":
      return DemoGallery;
    case "/historico":
      return HistoryPage;
    default:
      return App;
  }
}

const RootComponent = resolveRootComponent();

createRoot(rootElement).render(
  <StrictMode>
    <QueryProvider>
      <RootComponent />
    </QueryProvider>
  </StrictMode>,
);
