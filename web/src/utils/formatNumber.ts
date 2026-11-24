/**
 * Números no padrão brasileiro: vírgula decimal e SEM separador de milhar
 * ("1011,3 hPa", convenção dos boletins meteorológicos). Revisão física,
 * 2026-11-24: a tela mostrava "1011.3" (ponto) e o PDF "1.011,3" (milhar) —
 * agora tela e relatório usam a mesma forma.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(minDigits: number, maxDigits: number): Intl.NumberFormat {
  const key = `${minDigits}-${maxDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
      useGrouping: false,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Até `maxDigits` casas (sem zeros à direita): `24,7`, `61`, `1011,3`. */
export function formatDecimal(value: number, maxDigits = 1): string {
  // `+ 0` normaliza `-0` (ex.: -0,04 arredondado) para "0".
  const factor = 10 ** maxDigits;
  const rounded = Math.round(value * factor) / factor + 0;
  return getFormatter(0, maxDigits).format(rounded);
}

/** Exatamente `digits` casas: `24,0`, `1011,3`. */
export function formatFixed(value: number, digits: number): string {
  const factor = 10 ** digits;
  return getFormatter(digits, digits).format(Math.round(value * factor) / factor + 0);
}
