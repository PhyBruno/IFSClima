import { useState } from "react";
import { cn } from "@/lib/utils";
import { CustomRangePopover, type AppliedRange } from "./CustomRangePopover";
import { PeriodSelector, type PeriodOption } from "./PeriodSelector";

export {
  formatLocalDay,
  localDayBoundsToUtc,
  resolveCustomRange,
  type CustomRangeResult,
} from "./CustomRangePopover";

/**
 * `DateRangePicker` (F8 T8.6, design.md "Frontend — página /historico":
 * "presets 24h/7d/30d + custom"). Reusa `PeriodSelector` (F5) para o grupo de
 * botões de preset — mesma árvore/estilo do seletor de período do dashboard,
 * só com uma 4ª opção "Personalizado" que abre um calendário de intervalo
 * (HIST-01, "escolher um intervalo").
 *
 * **Estado interno, não controlado pelo pai (decisão de API)**: diferente de
 * `PeriodSelector` (controlado via `value`/`onChange`), este componente guarda
 * qual preset está ativo e o intervalo sendo escolhido no calendário como
 * estado próprio — o consumidor (`HistoryPage`) só precisa do INTERVALO
 * resultante (`onChange(from, to)`, ISO 8601 UTC), não de re-implementar a
 * máquina de estados "qual botão está aceso"/"o que já foi escolhido".
 *
 * **Presets calculam o intervalo no clique**, usando `now` (injetável — ver
 * abaixo) como "agora": `from = now - N dias`, `to = now`. Isso é ISO UTC de
 * verdade (não "deixa o backend resolver") porque paginação (`page`) e
 * export precisam do MESMO `from`/`to` explícito durante toda a sessão de
 * filtro — se o componente não emitisse um valor concreto, cada refetch de
 * página avançaria "agora" um pouco, fazendo o intervalo deslizar a cada
 * requisição.
 *
 * **`now` injetável**: testar presets e o calendário sem mockar `Date`
 * global — o teste passa uma função fixa (`() => new Date("2026-07-23T14:30:00.000Z")`)
 * e afirma o `from`/`to` exatos recebidos por `onChange`. Default
 * `() => new Date()` para uso real.
 *
 * **Calendário do shadcn/ui no "Personalizado" (pedido do usuário,
 * 2026-09-29; extraído para `CustomRangePopover` em 2026-11-24, reusado pelo
 * painel)**: os dois `<input type="date">` nativos viraram um `Popover`
 * com o `Calendar` do shadcn em `mode="range"` (react-day-picker, locale
 * pt-BR): 2 meses lado a lado no desktop e 1 no mobile, dias futuros
 * desabilitados, e um botão "Aplicar". O intervalo só é emitido no
 * "Aplicar", não a cada clique no calendário. Selecionar um intervalo leva
 * dois cliques (início e fim), e emitir no meio dispararia uma busca para
 * um intervalo que o usuário ainda está escolhendo. A granularidade continua
 * sendo o dia inteiro: `from` é o início do primeiro dia LOCAL e `to` o fim
 * do último, convertidos para UTC (ver `localDayBoundsToUtc`).
 *
 * **Dia do calendário LOCAL, não UTC (revisão de código F8, achado MÉDIO)**:
 * o `Calendar` devolve `Date`s à meia-noite LOCAL do dia clicado. Tratar a
 * data como se já fosse UTC deslocaria o intervalo em fusos negativos (ex.
 * UTC-3, o fuso do projeto) e dessincronizaria com a tabela
 * (`ReadingsTable` formata UTC→local). `localDayBoundsToUtc` monta os
 * limites pelos componentes locais do dia (`new Date(y, m, d, ...)`), e
 * `.toISOString()` dá o UTC correto.
 *
 * **Validação client-side do intervalo custom (revisão de código F8, achado
 * MÉDIO)**: o backend (`api/src/schemas/history.ts`, `MAX_RANGE_DAYS`)
 * rejeita com 400 um intervalo maior que `MAX_RANGE_DAYS` dias. A mesma
 * constante é duplicada aqui (não há pacote compartilhado entre `api/` e
 * `web/`, mesmo padrão de `src/api-client.ts`) para dar feedback imediato
 * no popover em vez de depender só do erro assíncrono do backend.
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
  /** Chamado com o intervalo ISO 8601 UTC resultante (preset calculado ou custom aplicado). */
  onChange: (from: string, to: string) => void;
  /** Injeção de "agora" para os presets e o calendário — testável sem mockar `Date` global. */
  now?: () => Date;
  className?: string;
}

export function DateRangePicker({
  defaultPreset = "24h",
  onChange,
  now = () => new Date(),
  className,
}: DateRangePickerProps) {
  const [preset, setPreset] = useState<DateRangePreset>(defaultPreset);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [applied, setApplied] = useState<AppliedRange | null>(null);

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
    if (value === "custom") {
      setCalendarOpen(true);
    } else {
      setCalendarOpen(false);
      applyPreset(value);
    }
  }

  function handleApply(from: string, to: string, days: AppliedRange) {
    setApplied(days);
    setCalendarOpen(false);
    onChange(from, to);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <PeriodSelector
        options={PRESET_OPTIONS}
        value={preset}
        onChange={handlePeriodSelectorChange}
      />

      {preset === "custom" && (
        <CustomRangePopover
          open={calendarOpen}
          onOpenChange={setCalendarOpen}
          applied={applied}
          onApply={handleApply}
          now={now}
        />
      )}
    </div>
  );
}

export default DateRangePicker;
