/**
 * Formata `age_seconds` (F4 `LatestReading`, F6 T6.2 — UI-03/AC3: "atualizado
 * há X") em texto relativo curto, ex. "há 2 min". Sem dependência de lib de
 * datas (o projeto não tem nenhuma) — só aritmética simples, arredondando
 * para a unidade mais legível (min < 60min, h < 24h, d daí em diante).
 *
 * `null` (nenhuma leitura ainda, UI-04) e valores negativos (relógio do
 * servidor/cliente dessincronizado) não lançam nem produzem "NaN" — caem em
 * textos neutros/"agora mesmo" em vez de números sem sentido.
 */
export function formatAge(ageSeconds: number | null): string {
  if (ageSeconds === null) {
    return "sem leitura";
  }

  if (ageSeconds < 60) {
    return "agora mesmo";
  }

  const minutes = Math.round(ageSeconds / 60);
  if (minutes < 60) {
    return `há ${minutes} min`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `há ${hours}h`;
  }

  const days = Math.round(hours / 24);
  return `há ${days}d`;
}

export default formatAge;
