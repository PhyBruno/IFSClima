/**
 * Eixo de TEMPO dos gráficos (tela e PDF) — funções puras, no fuso LOCAL do
 * navegador (mesma regra de `formatTime.ts`).
 *
 * Revisão física (pedido do usuário, 2026-11-24): antes, os gráficos
 * posicionavam os pontos por ÍNDICE, então um período sem leituras (estação
 * offline) era "comprimido" e a curva parecia contínua. Agora cada ponto fica
 * na sua posição real no tempo, o domínio do eixo é a janela consultada e um
 * buraco nos dados vira um buraco no traço (`insertGaps`).
 */

export const MS_PER_HOUR = 60 * 60 * 1000;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Acima deste intervalo, os gráficos ganham divisores suaves entre os dias (pedido do usuário, 2026-11-24). */
export const DAY_DIVIDER_MIN_SPAN_MS = 2 * MS_PER_DAY;

/** Até este intervalo, os rótulos do eixo X são horas; acima, dias. */
const HOUR_TICKS_MAX_SPAN_MS = 36 * MS_PER_HOUR;

export type BucketGranularity = "hour" | "day" | "raw";

export interface TimePoint {
  /** Epoch ms. */
  t: number;
  v: number | null;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Meia-noite LOCAL do dia de `t`. */
export function startOfLocalDay(t: number): number {
  const date = new Date(t);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Meia-noite local do dia seguinte (via componentes de data: respeita mudança de horário de verão). */
function nextLocalMidnight(midnight: number, days = 1): number {
  const date = new Date(midnight);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

/**
 * Meias-noites locais estritamente DENTRO de `(from, to)` — onde desenhar os
 * divisores de dia. Vazio quando o intervalo não passa de 2 dias (no 24h um
 * divisor só poluiria o gráfico).
 */
export function dayBoundaries(from: number, to: number): number[] {
  if (!(to - from > DAY_DIVIDER_MIN_SPAN_MS)) {
    return [];
  }

  const boundaries: number[] = [];
  for (
    let midnight = nextLocalMidnight(startOfLocalDay(from));
    midnight < to;
    midnight = nextLocalMidnight(midnight)
  ) {
    boundaries.push(midnight);
  }
  return boundaries;
}

const HOUR_STEPS = [1, 2, 3, 4, 6, 12];
const DAY_STEPS = [1, 2, 3, 5, 7, 14, 30, 61];

/**
 * Até `maxTicks` rótulos "redondos" dentro de `[from, to]`: horas cheias
 * (múltiplas de 1/2/3/4/6/12 h) em intervalos curtos, meias-noites locais
 * (a cada 1/2/3/5/7… dias) nos longos.
 */
export function timeTicks(from: number, to: number, maxTicks = 5): number[] {
  const span = to - from;
  if (!(span > 0)) {
    return Number.isFinite(from) ? [from] : [];
  }

  if (span <= HOUR_TICKS_MAX_SPAN_MS) {
    const stepHours =
      HOUR_STEPS.find((step) => span / (step * MS_PER_HOUR) <= maxTicks) ?? HOUR_STEPS.at(-1)!;
    const first = new Date(from);
    first.setMinutes(0, 0, 0);
    if (first.getTime() < from) {
      first.setHours(first.getHours() + 1);
    }
    while (first.getHours() % stepHours !== 0) {
      first.setHours(first.getHours() + 1);
    }

    const ticks: number[] = [];
    for (const tick = first; tick.getTime() <= to; tick.setHours(tick.getHours() + stepHours)) {
      ticks.push(tick.getTime());
    }
    return ticks;
  }

  const stepDays =
    DAY_STEPS.find((step) => span / (step * MS_PER_DAY) <= maxTicks) ?? DAY_STEPS.at(-1)!;
  const ticks: number[] = [];
  let midnight = startOfLocalDay(from);
  if (midnight < from) {
    midnight = nextLocalMidnight(midnight);
  }
  for (; midnight <= to; midnight = nextLocalMidnight(midnight, stepDays)) {
    ticks.push(midnight);
  }
  return ticks;
}

/** Rótulo de um tick do eixo X: `HH:MM` em intervalos de até 36 h, `DD/MM` acima. */
export function formatTick(t: number, spanMs: number): string {
  const date = new Date(t);
  return spanMs <= HOUR_TICKS_MAX_SPAN_MS
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}`
    : `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/**
 * Rótulo de UM ponto (título do tooltip): o bucket diário é o dia (`DD/MM`),
 * o horário é `DD/MM HH:MM` do início da hora, e a leitura bruta é o instante
 * exato dela.
 */
export function formatPointTime(t: number, granularity: BucketGranularity): string {
  const date = new Date(t);
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  if (granularity === "day") {
    return day;
  }
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Duração de um bucket, em ms (`raw` = 0: leitura pontual). */
export function bucketDurationMs(granularity: BucketGranularity): number {
  if (granularity === "hour") return MS_PER_HOUR;
  if (granularity === "day") return MS_PER_DAY;
  return 0;
}

/**
 * Posição no eixo de um bucket agregado: o CENTRO do intervalo que ele
 * resume (a média das 14h–15h representa 14h30, a do dia representa o meio
 * do dia), limitado à janela consultada (o primeiro/último bucket podem ser
 * parciais).
 */
export function bucketCenter(
  t: number,
  granularity: BucketGranularity,
  domain?: readonly [number, number],
): number {
  const center = t + bucketDurationMs(granularity) / 2;
  if (!domain) {
    return center;
  }
  return Math.min(Math.max(center, domain[0]), domain[1]);
}

/**
 * Insere um ponto `null` entre dois pontos consecutivos separados por mais
 * de `maxGapMs` — o traço do gráfico é interrompido ali, em vez de uma reta
 * atravessar horas ou dias sem nenhuma leitura. `points` deve estar em ordem
 * cronológica.
 */
export function insertGaps<T extends TimePoint>(
  points: readonly T[],
  maxGapMs: number,
): (T | TimePoint)[] {
  const result: (T | TimePoint)[] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous && point.t - previous.t > maxGapMs) {
      result.push({ t: (previous.t + point.t) / 2, v: null });
    }
    result.push(point);
  });
  return result;
}

/**
 * Intervalo máximo entre dois pontos de leituras BRUTAS antes de o traço ser
 * interrompido: a estação envia a cada ~15 min, então 1 h sem nada já é uma
 * falha de transmissão, não uma variação a interpolar.
 */
export const RAW_MAX_GAP_MS = MS_PER_HOUR;

/** Intervalo máximo entre buckets consecutivos: 1,5× o tamanho do bucket (um bucket inteiro faltando já é buraco). */
export function maxGapFor(granularity: BucketGranularity): number {
  return granularity === "raw" ? RAW_MAX_GAP_MS : bucketDurationMs(granularity) * 1.5;
}

/**
 * Até este intervalo (o "24 h", com folga), os gráficos de pontos mostram
 * cada leitura bruta. Acima de 1 dia, são milhares de pontos que viram uma
 * mancha: os pontos passam a ser as MESMAS médias por hora/dia do gráfico de
 * linha (pedido do usuário, 2026-11-24).
 */
export const RAW_DOTS_MAX_SPAN_MS = 36 * MS_PER_HOUR;

/** `true` quando a janela `[from, to]` (ISO) é curta o bastante para pontos de leitura bruta. */
export function usesRawDots(from: string | undefined, to: string | undefined): boolean {
  if (from === undefined || to === undefined) {
    return false;
  }
  const span = Date.parse(to) - Date.parse(from);
  return Number.isFinite(span) && span <= RAW_DOTS_MAX_SPAN_MS;
}
