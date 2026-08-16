/**
 * Classificação de criticidade do Índice UV pela escala internacional da OMS
 * (WHO Global Solar UV Index, junto com WMO/UNEP/ICNIRP) — pedido do usuário,
 * 2026-08-16, para uma badge no card de sensor do UV no KPI da última leitura
 * (`SensorGrid`/`StatCard`). Os 5 níveis e seus limiares (0-2/3-5/6-7/8-10/11+)
 * são o padrão oficial usado por institutos meteorológicos (ex. INMET) — não
 * uma escala inventada para este produto.
 */
export type UvCriticality = "low" | "moderate" | "high" | "very-high" | "extreme";

export interface UvCriticalityInfo {
  level: UvCriticality;
  /** Rótulo em português, igual ao usado pelo INMET/OMS. */
  label: string;
}

const LEVELS: { max: number; level: UvCriticality; label: string }[] = [
  { max: 2, level: "low", label: "Baixo" },
  { max: 5, level: "moderate", label: "Moderado" },
  { max: 7, level: "high", label: "Alto" },
  { max: 10, level: "very-high", label: "Muito alto" },
  { max: Infinity, level: "extreme", label: "Extremo" },
];

/**
 * `value` (Índice UV bruto, contínuo — ex. `5.3`) → nível de criticidade
 * OMS. A escala oficial é definida em números INTEIROS (0-2/3-5/6-7/8-10/
 * 11+, igual a qualquer boletim meteorológico que reporta "Índice UV: 5") —
 * por isso arredonda antes de comparar aos limiares, em vez de comparar o
 * valor fracionário direto (que classificaria 2.9 como "Baixo" quando todo
 * boletim reportaria "Índice UV: 3", já "Moderado"). Valores negativos (não
 * deveriam ocorrer, mas o sensor é hardware real) caem no mesmo nível
 * "Baixo" do 0 — não há um nível "abaixo de baixo" na escala oficial.
 */
export function getUvCriticality(value: number): UvCriticalityInfo {
  const rounded = Math.max(0, Math.round(value));
  const match = LEVELS.find((entry) => rounded <= entry.max) ?? LEVELS[LEVELS.length - 1]!;
  return { level: match.level, label: match.label };
}

export default getUvCriticality;
