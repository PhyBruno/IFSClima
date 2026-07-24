import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** Servidor MSW (Node) compartilhado pelos testes — ciclo de vida em `test/setup.ts`. */
export const server = setupServer(...handlers);
