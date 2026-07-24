import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, type QueryClientConfig } from "@tanstack/react-query";

/**
 * Fábrica do `QueryClient` (F6 T6.1 — design.md "Decisões de design": sem
 * cache customizado além do que o React Query já oferece; retry/backoff
 * default da lib). Exportada (não só o provider) para os testes de hooks
 * poderem criar uma instância isolada por teste (evita cache vazando entre
 * `it(...)`) e sobrescrever `retry: false` para não esperar o backoff real
 * nos cenários de erro.
 */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient(config);
}

// Instância única usada pela aplicação real (montada em `main.tsx`).
const appQueryClient = createQueryClient();

export interface QueryProviderProps {
  children: ReactNode;
}

/** Provider React Query da aplicação (F6 T6.1). */
export function QueryProvider({ children }: QueryProviderProps) {
  return <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>;
}

export default QueryProvider;
