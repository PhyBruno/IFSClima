import type { Range, SeriesWindow } from "../api-client";

/**
 * Período do painel: um preset relativo a "agora" (24h/7d/30d) ou um
 * intervalo personalizado escolhido no calendário (pedido do usuário,
 * 2026-11-24). Fonte única na URL (`?range=`, mais `&from=&to=` no
 * personalizado), lida pelo `ChartsSection` e pelo export do PDF do painel.
 */
export type Period = { range: Range } | { range: "custom"; from: string; to: string };

export const PRESET_RANGES: Range[] = ["24h", "7d", "30d"];

/**
 * Teto do "Personalizado" do painel: 3 meses (pedido do usuário,
 * 2026-11-24). Espelha `SERIES_MAX_RANGE_DAYS` de `api/src/schemas/readings.ts`.
 */
export const DASHBOARD_MAX_RANGE_DAYS = 92;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_PERIOD: Period = { range: "24h" };

const RANGE_PARAM = "range";
const FROM_PARAM = "from";
const TO_PARAM = "to";

function isPresetRange(value: string | null): value is Range {
  return value !== null && (PRESET_RANGES as string[]).includes(value);
}

function isIsoInstant(value: string | null): value is string {
  return value !== null && value !== "" && !Number.isNaN(new Date(value).getTime());
}

/**
 * Lê o período de uma query string (`location.search`). Personalizado
 * incompleto, inválido, invertido ou acima de 3 meses cai no default (24h)
 * — nunca uma requisição que a API rejeitaria.
 */
export function getPeriodFromSearch(search: string): Period {
  const params = new URLSearchParams(search);
  const range = params.get(RANGE_PARAM);

  if (isPresetRange(range)) {
    return { range };
  }

  if (range === "custom") {
    const from = params.get(FROM_PARAM);
    const to = params.get(TO_PARAM);
    const spanMs = isIsoInstant(from) && isIsoInstant(to) ? Date.parse(to) - Date.parse(from) : -1;
    // Margem de 1 dia: `to` é o FIM do último dia (23:59:59.999), então N dias
    // de calendário somam quase N+1 dias corridos.
    if (spanMs >= 0 && spanMs <= (DASHBOARD_MAX_RANGE_DAYS + 1) * MS_PER_DAY) {
      return { range: "custom", from, to };
    }
  }

  return DEFAULT_PERIOD;
}

/** Nova query string com o período, preservando os demais parâmetros. */
export function buildSearchWithPeriod(search: string, period: Period): string {
  const params = new URLSearchParams(search);
  params.set(RANGE_PARAM, period.range);
  if (period.range === "custom") {
    params.set(FROM_PARAM, period.from);
    params.set(TO_PARAM, period.to);
  } else {
    params.delete(FROM_PARAM);
    params.delete(TO_PARAM);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Período → janela pedida à API de séries. */
export function periodToWindow(period: Period): SeriesWindow {
  return period.range === "custom" ? { from: period.from, to: period.to } : { range: period.range };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function localDay(iso: string, withYear: boolean): string {
  const date = new Date(iso);
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  return withYear ? `${day}/${date.getFullYear()}` : day;
}

const PRESET_LABELS: Record<Range, { short: string; long: string }> = {
  "24h": { short: "Últimas 24h", long: "Últimas 24 horas" },
  "7d": { short: "Últimos 7 dias", long: "Últimos 7 dias" },
  "30d": { short: "Últimos 30 dias", long: "Últimos 30 dias" },
};

/**
 * Nome do período para leitura humana: `short` no painel ("Últimas 24h",
 * "25/10 – 24/11"), `long` no relatório ("Últimas 24 horas",
 * "25/10/2026 – 24/11/2026"). No personalizado, `to` é o fim do último dia
 * (23:59:59.999 local), então o dia exibido é o próprio último dia.
 */
export function periodLabel(period: Period, style: "short" | "long" = "short"): string {
  if (period.range === "custom") {
    const withYear = style === "long";
    return `${localDay(period.from, withYear)} – ${localDay(period.to, withYear)}`;
  }
  return PRESET_LABELS[period.range][style];
}
