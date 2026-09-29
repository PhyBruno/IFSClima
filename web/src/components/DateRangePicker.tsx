import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { PeriodSelector, type PeriodOption } from "./PeriodSelector";

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
 * 2026-09-29)**: os dois `<input type="date">` nativos viraram um `Popover`
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

/**
 * Duplica `MAX_RANGE_DAYS` de `api/src/schemas/history.ts` — não há pacote
 * compartilhado entre `api/` e `web/` (mesmo padrão de `src/api-client.ts`,
 * ver comentário no topo daquele arquivo). Mudar o limite no backend exige
 * atualizar aqui também.
 */
const MAX_RANGE_DAYS = 366;

/** Quantos anos para trás o calendário deixa navegar (o limite de 366 dias do backend, com folga). */
const CALENDAR_HISTORY_YEARS = 3;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** `Date` → `"DD/MM/AAAA"` do dia LOCAL. */
export function formatLocalDay(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Dia do calendário LOCAL (qualquer horário dentro dele) → limites REAIS em
 * UTC desse dia: início (00:00:00.000 local) e fim (23:59:59.999 local).
 *
 * `new Date(year, monthIndex, day, h, m, s, ms)` é o construtor de
 * COMPONENTES: o JS resolve esses componentes no fuso LOCAL do ambiente,
 * exatamente o que precisamos aqui.
 *
 * Exportado para teste isolado da conversão (independente do fuso onde o
 * teste roda, ver `test/components/DateRangePicker.test.tsx`).
 */
export function localDayBoundsToUtc(day: Date): [string, string] {
  const year = day.getFullYear();
  const month = day.getMonth();
  const date = day.getDate();
  const start = new Date(year, month, date, 0, 0, 0, 0);
  const end = new Date(year, month, date, 23, 59, 59, 999);
  return [start.toISOString(), end.toISOString()];
}

/**
 * Diferença em dias entre dois dias de calendário LOCAL, comparando as
 * meias-noites locais de cada um (não os limites UTC, que introduziriam viés
 * de fuso). Negativo quando `to` é anterior a `from`.
 */
function daysBetweenLocalDays(from: Date, to: Date): number {
  const fromStart = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toStart = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toStart.getTime() - fromStart.getTime()) / MS_PER_DAY);
}

export type CustomRangeResult = { from: string; to: string } | { error: string };

/**
 * Valida e converte um intervalo escolhido no calendário para os limites
 * UTC enviados ao backend. Pura e exportada para testar a validação sem
 * navegar mês a mês no calendário.
 */
export function resolveCustomRange(from: Date, to: Date): CustomRangeResult {
  const rangeDays = daysBetweenLocalDays(from, to);

  if (rangeDays < 0) {
    return { error: "A data inicial não pode ser depois da data final." };
  }

  if (rangeDays > MAX_RANGE_DAYS) {
    return { error: `O intervalo não pode ser maior que ${MAX_RANGE_DAYS} dias.` };
  }

  const [fromUtc] = localDayBoundsToUtc(from);
  const [, toUtc] = localDayBoundsToUtc(to);
  return { from: fromUtc, to: toUtc };
}

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

/** Legenda do rodapé do popover: o que já foi escolhido e quantos dias o intervalo tem. */
function describeRange(range: DateRange | undefined): string {
  if (!range?.from) {
    return "Selecione a data inicial e a final.";
  }
  if (!range.to) {
    return `${formatLocalDay(range.from)} – selecione a data final`;
  }
  const days = daysBetweenLocalDays(range.from, range.to) + 1;
  return `${formatLocalDay(range.from)} – ${formatLocalDay(range.to)} · ${days} ${
    days === 1 ? "dia" : "dias"
  }`;
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
  const isMobile = useIsMobile();
  const [preset, setPreset] = useState<DateRangePreset>(defaultPreset);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const [applied, setApplied] = useState<{ from: Date; to: Date } | null>(null);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);

  const today = now();
  const numberOfMonths = isMobile ? 1 : 2;
  // Mês corrente na coluna da direita (desktop): o usuário quase sempre olha para trás no tempo.
  const defaultMonth = new Date(today.getFullYear(), today.getMonth() - (numberOfMonths - 1), 1);

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

  function handleSelect(range: DateRange | undefined) {
    setDraft(range);
    setCustomRangeError(null);
  }

  function handleApply() {
    if (!draft?.from || !draft.to) {
      return;
    }

    const result = resolveCustomRange(draft.from, draft.to);
    if ("error" in result) {
      setCustomRangeError(result.error);
      return;
    }

    setCustomRangeError(null);
    setApplied({ from: draft.from, to: draft.to });
    setCalendarOpen(false);
    onChange(result.from, result.to);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <PeriodSelector
        options={PRESET_OPTIONS}
        value={preset}
        onChange={handlePeriodSelectorChange}
      />

      {preset === "custom" && (
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          {/* Sem `asChild` + `Button`: o `Button` do shadcn não repassa `ref` no React 18, e o
              Radix precisa do ref do trigger para ancorar o popover. */}
          <PopoverTrigger
            data-slot="button"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-fit justify-start font-normal",
              !applied && "text-muted-foreground",
            )}
          >
            <CalendarIcon aria-hidden="true" data-icon="inline-start" />
            {applied
              ? `${formatLocalDay(applied.from)} – ${formatLocalDay(applied.to)}`
              : "Escolher intervalo"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              locale={ptBR}
              numberOfMonths={numberOfMonths}
              defaultMonth={draft?.from ?? defaultMonth}
              selected={draft}
              onSelect={handleSelect}
              disabled={{ after: today }}
              showOutsideDays={false}
              captionLayout="dropdown"
              startMonth={new Date(today.getFullYear() - CALENDAR_HISTORY_YEARS, 0, 1)}
              endMonth={today}
            />
            <div className="flex flex-col gap-2 border-t p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  {describeRange(draft)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApply}
                  disabled={!draft?.from || !draft.to}
                >
                  Aplicar
                </Button>
              </div>
              {customRangeError && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {customRangeError}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export default DateRangePicker;
