import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Popover "Personalizado" com o `Calendar` do shadcn em `mode="range"` —
 * extraído de `DateRangePicker` (Histórico) para ser reusado pelo seletor de
 * período do painel (pedido do usuário, 2026-11-24: "um seletor de data
 * personalizado, assim como tem a aba de histórico").
 *
 * **O intervalo só é emitido no "Aplicar"**, nunca a cada clique: escolher
 * um intervalo leva dois cliques (início e fim), e emitir no meio dispararia
 * uma busca para um intervalo ainda incompleto.
 *
 * **Dia LOCAL, não UTC (revisão de código F8, achado MÉDIO)**: o `Calendar`
 * devolve `Date`s à meia-noite LOCAL do dia clicado. `localDayBoundsToUtc`
 * monta os limites pelos componentes locais do dia (`new Date(y, m, d, ...)`)
 * e `.toISOString()` dá o UTC correto — tratar a data como UTC deslocaria o
 * intervalo em fusos negativos (ex. UTC-3, o fuso do projeto).
 *
 * **Validação client-side (revisão de código F8, achado MÉDIO)**: o backend
 * rejeita com 400 um intervalo maior que `MAX_RANGE_DAYS` dias
 * (`api/src/schemas/history.ts`, também usado por `/readings/series`). A
 * constante é duplicada aqui (não há pacote compartilhado entre `api/` e
 * `web/`) para dar feedback imediato no popover.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Duplica `MAX_RANGE_DAYS` de `api/src/schemas/history.ts` — mudar lá exige mudar aqui. */
export const MAX_RANGE_DAYS = 366;

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
 * meias-noites locais de cada um. Negativo quando `to` é anterior a `from`.
 */
function daysBetweenLocalDays(from: Date, to: Date): number {
  const fromStart = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toStart = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toStart.getTime() - fromStart.getTime()) / MS_PER_DAY);
}

export type CustomRangeResult = { from: string; to: string } | { error: string };

/**
 * Valida e converte um intervalo escolhido no calendário para os limites UTC
 * enviados ao backend. `maxDays` é o teto (dias de calendário além do
 * primeiro); `maxLabel`, como ele aparece na mensagem de erro.
 */
export function resolveCustomRange(
  from: Date,
  to: Date,
  maxDays = MAX_RANGE_DAYS,
  maxLabel = `${maxDays} dias`,
): CustomRangeResult {
  const rangeDays = daysBetweenLocalDays(from, to);

  if (rangeDays < 0) {
    return { error: "A data inicial não pode ser depois da data final." };
  }

  if (rangeDays > maxDays) {
    return { error: `O intervalo não pode ser maior que ${maxLabel}.` };
  }

  const [fromUtc] = localDayBoundsToUtc(from);
  const [, toUtc] = localDayBoundsToUtc(to);
  return { from: fromUtc, to: toUtc };
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

export interface AppliedRange {
  /** Dias LOCAIS escolhidos no calendário (para o rótulo do botão). */
  from: Date;
  to: Date;
}

export interface CustomRangePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Intervalo já aplicado (rótulo do botão); `null` = nada escolhido ainda. */
  applied: AppliedRange | null;
  /** Chamado no "Aplicar" com os limites ISO 8601 UTC e os dias locais escolhidos. */
  onApply: (from: string, to: string, days: AppliedRange) => void;
  /** "Agora" injetável (dias futuros desabilitados, mês inicial) — testável sem mockar `Date`. */
  now?: () => Date;
  /** Teto do intervalo, em dias (default: o do backend do histórico, 366). */
  maxDays?: number;
  /** Teto como aparece na mensagem de erro (ex. "3 meses"). Default: "N dias". */
  maxLabel?: string;
}

export function CustomRangePopover({
  open,
  onOpenChange,
  applied,
  onApply,
  now = () => new Date(),
  maxDays = MAX_RANGE_DAYS,
  maxLabel,
}: CustomRangePopoverProps) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<DateRange | undefined>(
    applied ? { from: applied.from, to: applied.to } : undefined,
  );
  const [error, setError] = useState<string | null>(null);

  const today = now();
  const numberOfMonths = isMobile ? 1 : 2;
  // Mês corrente na coluna da direita (desktop): o usuário quase sempre olha para trás no tempo.
  const defaultMonth = new Date(today.getFullYear(), today.getMonth() - (numberOfMonths - 1), 1);

  function handleSelect(range: DateRange | undefined) {
    setDraft(range);
    setError(null);
  }

  function handleApply() {
    if (!draft?.from || !draft.to) {
      return;
    }

    const result = resolveCustomRange(draft.from, draft.to, maxDays, maxLabel);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError(null);
    onApply(result.from, result.to, { from: draft.from, to: draft.to });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default CustomRangePopover;
