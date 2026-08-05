/**
 * Formata um timestamp ISO UTC (ex. `LatestReading.timestamp`, `SeriesBucket.t`
 * de `api-client.ts`) no horário LOCAL do navegador — F6 T6.4 (design.md
 * "Formatação": `formatTime(utc, tz)`; spec.md edge case "fuso do usuário:
 * eixos/tempos formatados no fuso local a partir de UTC").
 *
 * Não recebe `tz` explícito: o projeto não tem nenhuma lib de fuso horário
 * (mesma decisão já tomada em `formatAge.ts`/`StatusPill.tsx`/
 * `ChartsSection.tsx`) e `Date#getHours`/`getDate` já resolvem para o fuso
 * do AMBIENTE ONDE RODAM (o navegador do usuário em produção) — exatamente
 * "formatar no cliente a partir de UTC" (design.md). Um `tz` explícito só
 * faria sentido para formatar o fuso de OUTRA pessoa, fora de escopo aqui.
 *
 * Complementar a `formatAge.ts` (tempo relativo, "há X min"), não um
 * substituto — este util produz horário ABSOLUTO ("14:30"), para eixos de
 * gráfico e qualquer exibição de horário exato (ex. `ConnectionBanner`).
 *
 * `null`/`undefined`/string inválida (sem leitura ainda, ou payload
 * inesperado) não lançam nem produzem "NaN:NaN" — mesmo princípio de
 * `formatAge.ts`: cai num placeholder neutro em vez de um número sem sentido.
 */

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function parseValidDate(utc: string | null | undefined): Date | null {
  if (!utc) {
    return null;
  }

  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `utc` → `"HH:MM"` no fuso local. Placeholder `"--:--"` se ausente/inválido. */
export function formatTime(utc: string | null | undefined): string {
  const date = parseValidDate(utc);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "--:--";
}

/** `utc` → `"DD/MM"` no fuso local. Placeholder `"--/--"` se ausente/inválido. */
export function formatDayMonth(utc: string | null | undefined): string {
  const date = parseValidDate(utc);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}` : "--/--";
}

/**
 * `utc` → `"DD/MM"` do dia UTC, SEM reinterpretar no fuso local — usada só
 * para buckets de granularidade `"day"` (`range=30d`), onde `t` já é
 * `date_trunc('day', ...)` calculado em UTC pela sessão do Postgres
 * (`api/src/db/client.ts` força `timezone=UTC`). Diferente de `formatDayMonth`
 * (que formata um INSTANTE no fuso do usuário, correto para timestamps de
 * leitura/hora), aqui `utc` já É o dia calendário — reformatar com
 * `Date#getDate()` (fuso local) desloca pro dia anterior em qualquer fuso
 * negativo (ex. Brasil, UTC-3: meia-noite UTC vira 21h do dia anterior).
 */
export function formatDayMonthUTC(utc: string | null | undefined): string {
  const date = parseValidDate(utc);
  return date ? `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}` : "--/--";
}

export default formatTime;
