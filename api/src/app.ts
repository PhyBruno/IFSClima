import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { parseEnv, parseRateLimitEnv } from "./config/env.js";
import { createLoggerOptions } from "./config/logger.js";
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
  /** T7.2 (QA-09): injeção da checagem de conectividade de `/health` (fake em teste). Default: `SELECT 1` real via `getDb()`. */
  checkDb?: () => Promise<void>;
  /**
   * T7.2 (QA-07): limite de rate limiting aplicado a `POST /api/v1/ingest`
   * (o endpoint mais sensível a abuso — recebe lotes). Default: env
   * `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` (100 req/min). Testes usam um
   * `max` baixo para forçar `429` sem precisar de centenas de requisições.
   */
  rateLimit?: { max: number; timeWindow: number };
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
    logger: createLoggerOptions(),
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

  // T7.2 (QA-07): resolvido no registro (não por requisição) porque
  // `@fastify/rate-limit` precisa do `max`/`timeWindow` na configuração da
  // rota — `parseRateLimitEnv()` nunca lança por falta de
  // DATABASE_URL/INGEST_API_KEY (schema próprio, todo com default), então
  // isso não quebra `buildApp()` chamado sem env (F1).
  const rateLimit =
    options.rateLimit ??
    (() => {
      const env = parseRateLimitEnv();
      return { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW_MS };
    })();

  // T7.2 (QA-08): helmet global — headers de segurança em toda resposta.
  app.register(fastifyHelmet);
  // T7.2 (QA-07): registrado com `global: false` — não limita nenhuma rota
  // por padrão (não pode quebrar o polling do dashboard em F4/F6:
  // `GET /readings/latest` a cada 60s, `GET /readings/series`, nem
  // paginação de histórico). Só a ingestão opta-in via `config.rateLimit`
  // na própria rota (ver `routes/ingest.ts`).
  app.register(fastifyRateLimit, { global: false });

  app.register(healthRoute, { checkDb: options.checkDb });
  app.register(ingestRoute, { ingestService, getIngestApiKey, getMaxBatch, rateLimit });
  app.register(readingsRoute, { readingsService, stationId: DEFAULT_STATION_ID });
  app.register(historyRoute, { historyService, stationId: DEFAULT_STATION_ID });

  return app;
}
