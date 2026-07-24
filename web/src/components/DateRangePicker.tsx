import { useState } from "react";
import { PeriodSelector, type PeriodOption } from "./PeriodSelector";

/**
 * `DateRangePicker` (F8 T8.6, design.md "Frontend — página /historico":
 * "presets 24h/7d/30d + custom"). Reusa `PeriodSelector` (F5) para o grupo de
 * botões de preset — mesma árvore/estilo do seletor de período do dashboard,
 * só com uma 4ª opção "Personalizado" que revela dois inputs de data
 * (HIST-01, "escolher um intervalo").
 *
 * **Estado interno, não controlado pelo pai (decisão de API)**: diferente de
 * `PeriodSelector` (controlado via `value`/`onChange`), este componente guarda
 * qual preset está ativo e o texto dos dois inputs de data como estado
 * próprio — o consumidor (`HistoryPage`) só precisa do INTERVALO resultante
 * (`onChange(from, to)`, ISO 8601 UTC), não de re-implementar a máquina de
 * estados "qual botão está aceso"/"o que já foi digitado". Simplifica tanto
 * `HistoryPage` quanto os testes deste componente (não precisa de um wrapper
 * controlado só para exercitar cada preset).
 *
 * **Presets calculam o intervalo no clique**, usando `now` (injetável — ver
 * abaixo) como "agora": `from = now - N dias`, `to = now`. Isso é ISO UTC de
 * verdade (não "deixa o backend resolver") porque paginação (`page`) e
 * export precisam do MESMO `from`/`to` explícito durante toda a sessão de
 * filtro — se o componente não emitisse um valor concreto, cada refetch de
 * página avançaria "agora" um pouco, fazendo o intervalo desLizar a cada
 * requisição.
 *
 * **`now` injetável**: testar presets sem mockar `Date` global — o teste
 * passa uma função fixa (`() => new Date("2026-07-23T14:30:00.000Z")`) e
 * afirma o `from`/`to` exatos recebidos por `onChange`. Default
 * `() => new Date()` para uso real.
 *
 * **Custom só dispara `onChange` quando AMBAS as datas estão preenchidas** —
 * disparar com só uma metade do intervalo (`from` sem `to` ou vice-versa)
 * geraria uma query inválida/incompleta contra o backend antes que o usuário
 * termine de digitar.
 *
 * **`type="date"` (não `datetime-local`)**: o backend já aceita granularidade
 * de dia inteiro (o usuário escolhe "de/até que DIA", não um horário exato) —
 * `from` vira início do dia (`T00:00:00.000Z`) e `to` vira fim do dia
 * (`T23:59:59.999Z`), cobrindo o dia inteiro em UTC. Mais simples de testar
 * (RTL: `fireEvent.change(input, { target: { value: "2026-07-01" } })`) do
 * que compor `datetime-local` (data + hora em dois formatos de string
 * diferentes).
 */
export type DateRangePreset = "24h" | "7d" | "30d" | "custom";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const PRESET_DAYS: Record<Exclude<DateRangePreset, "custom">, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
};

const PRESET_OPTIONS: PeriodOption[] = [
  { value: "24h", label: "Últimas 24h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "custom", label: "Personalizado" },
];

function isDateRangePreset(value: string): value is DateRangePreset {
  return value === "24h" || value === "7d" || value === "30d" || value === "custom";
}

export interface DateRangePickerProps {
  /** Preset inicialmente ativo (default "24h" — mesmo default do backend, HIST-05). */
  defaultPreset?: DateRangePreset;
  /** Chamado com o intervalo ISO 8601 UTC resultante (preset calculado ou custom com as duas datas preenchidas). */
  onChange: (from: string, to: string) => void;
  /** Injeção de "agora" para os presets — testável sem mockar `Date` global. */
  now?: () => Date;
  className?: string;
}

export function DateRangePicker({
  defaultPreset = "24h",
  onChange,
  now = () => new Date(),
  className = "",
}: DateRangePickerProps) {
  const [preset, setPreset] = useState<DateRangePreset>(defaultPreset);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function applyPreset(value: Exclude<DateRangePreset, "custom">) {
    const to = now();
    const from = new Date(to.getTime() - PRESET_DAYS[value] * MS_PER_DAY);
    onChange(from.toISOString(), to.toISOString());
  }

  function handlePeriodSelectorChange(value: string) {
    if (!isDateRangePreset(value)) {
      return;
    }

    setPreset(value);
    if (value !== "custom") {
      applyPreset(value);
    }
  }

  function emitCustomIfComplete(from: string, to: string) {
    if (from && to) {
      onChange(`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`);
    }
  }

  function handleFromChange(value: string) {
    setCustomFrom(value);
    emitCustomIfComplete(value, customTo);
  }

  function handleToChange(value: string) {
    setCustomTo(value);
    emitCustomIfComplete(customFrom, value);
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      <PeriodSelector
        options={PRESET_OPTIONS}
        value={preset}
        onChange={handlePeriodSelectorChange}
      />

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="date-range-from" className="text-xs font-medium text-text-tertiary">
              De
            </label>
            <input
              id="date-range-from"
              type="date"
              value={customFrom}
              onChange={(event) => handleFromChange(event.target.value)}
              className="rounded-lg border border-border-default bg-surface-card px-2 py-1.5 text-sm text-text-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date-range-to" className="text-xs font-medium text-text-tertiary">
              Até
            </label>
            <input
              id="date-range-to"
              type="date"
              value={customTo}
              onChange={(event) => handleToChange(event.target.value)}
              className="rounded-lg border border-border-default bg-surface-card px-2 py-1.5 text-sm text-text-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
