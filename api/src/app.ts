import Fastify, { type FastifyInstance } from "fastify";
import { parseEnv } from "./config/env.js";
import { getDb } from "./db/client.js";
import { healthRoute } from "./routes/health.js";
import { historyRoute } from "./routes/history.js";
import { ingestRoute } from "./routes/ingest.js";
import { readingsRoute } from "./routes/readings.js";
import {
  DrizzleReadingRepository,
  type ReadingRepository,
} from "./repositories/reading-repository.js";
import { MAX_BATCH as SCHEMA_MAX_BATCH } from "./schemas/ingest.js";
import { createHistoryService, type HistoryService } from "./services/history-service.js";
import { createIngestService } from "./services/ingest-service.js";
import { createReadingsService } from "./services/readings-service.js";

/** Estação única do v1 (D3) — usada tanto pelo default de ingestão quanto pelas rotas de leitura (F4). */
export const DEFAULT_STATION_ID = "main";

export interface BuildAppOptions {
  /** F3/F4: injeção de dependência do repositório (fake em teste, Drizzle real em produção). */
  readingRepository?: ReadingRepository;
  /** F3: chave esperada no header `X-API-Key`. Default: lê `INGEST_API_KEY` do env (lazy). */
  ingestApiKey?: string;
  /** F3: teto de itens por lote para a resposta 413 (ING-08). Default: env `MAX_BATCH`, nunca acima do teto do schema Zod. */
  maxBatch?: number;
  /** F8: injeção de dependência do serviço de histórico/export (fake em teste). */
  historyService?: HistoryService;
}

/**
 * `ReadingRepository` que só toca `getDb()` (que valida env) quando um
 * método é de fato chamado — preserva `buildApp()` "testável sem porta/DB"
 * (F1) mesmo registrando a rota de ingestão por padrão.
 */
function lazyDrizzleReadingRepository(): ReadingRepository {
  let cached: ReadingRepository | undefined;
  const resolve = (): ReadingRepository => {
    cached ??= new DrizzleReadingRepository(getDb().db);
    return cached;
  };

  return {
    ensureStation: (id) => resolve().ensureStation(id),
    insertIgnoreConflicts: (rows) => resolve().insertIgnoreConflicts(rows),
    findLatest: (stationId) => resolve().findLatest(stationId),
    aggregate: (stationId, metric, since, bucketUnit) =>
      resolve().aggregate(stationId, metric, since, bucketUnit),
    findRange: (params) => resolve().findRange(params),
    streamRange: (stationId, from, to, order) => resolve().streamRange(stationId, from, to, order),
  };
}

/**
 * Cria (mas não sobe) uma instância Fastify configurada.
 * Testável sem abrir porta — use `app.inject(...)` nos testes.
 *
 * Sem `options`, usa dependências de produção resolvidas de forma
 * preguiçosa (`getDb()`/`parseEnv()` só são chamadas quando uma requisição
 * de fato chega em `/api/v1/ingest`) — chamar `buildApp()` continua seguro
 * em testes que não configuram `DATABASE_URL`/`INGEST_API_KEY` (ex.:
 * `test/app.test.ts`, `test/health.test.ts`).
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  const readingRepository = options.readingRepository ?? lazyDrizzleReadingRepository();
  const ingestService = createIngestService(readingRepository);
  const readingsService = createReadingsService(readingRepository);
  const historyService = options.historyService ?? createHistoryService(readingRepository);

  const getIngestApiKey =
    options.ingestApiKey !== undefined
      ? () => options.ingestApiKey as string
      : () => parseEnv().INGEST_API_KEY;

  const getMaxBatch =
    options.maxBatch !== undefined
      ? () => options.maxBatch as number
      : () => Math.min(parseEnv().MAX_BATCH, SCHEMA_MAX_BATCH);

  app.register(healthRoute);
  app.register(ingestRoute, { ingestService, getIngestApiKey, getMaxBatch });
  app.register(readingsRoute, { readingsService, stationId: DEFAULT_STATION_ID });
  app.register(historyRoute, { historyService, stationId: DEFAULT_STATION_ID });

  return app;
}
