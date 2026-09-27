import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HistoryReading } from "../api-client";
import { EmptyState } from "./EmptyState";
import { formatDayMonth, formatTime } from "../utils/formatTime";
import { cn } from "@/lib/utils";

/**
 * `ReadingsTable` (F8 T8.6, design.md "Frontend — página /historico") —
 * tabela paginada de leituras brutas (HIST-01..HIST-04) sobre `Table` e
 * `Card` do shadcn/ui. Reusa `Card` (container) e `EmptyState` (F5, intervalo sem dados) em vez de recriar
 * qualquer um dos dois.
 *
 * **Timestamp em fuso local (HIST-08 aplicado à UI)**: `formatDayMonth` +
 * `formatTime` (`utils/formatTime.ts`) — mesmo par já usado por
 * `ChartsSection`, convertendo o `timestamp` UTC do backend para o fuso do
 * navegador. O export (`buildExportUrl`, botões em `HistoryPage`) mantém UTC
 * — só a exibição na tabela é local, conforme a regra de design.md
 * ("Timezone").
 *
 * **Célula nula → "—" (HIST-03)**: cada um dos 5 sensores pode ser `null`
 * numa leitura pontual (mesmo modelo de `LatestReading`) — em vez de "0" ou
 * "NaN", a célula mostra um travessão neutro, mesmo padrão de placeholder já
 * usado por `formatTime`/`formatAge` para dado ausente.
 *
 * **Paginação por offset simples (HIST-02)**: `total`/`pageSize` calculam o
 * número de páginas aqui (não vem pronto do backend, ver `HistoryResponse`);
 * "Anterior"/"Próxima" desabilitam nos limites (`page<=1`/`page>=totalPages`)
 * em vez de deixar o chamador tentar uma página inválida.
 *
 * **Sem `uppercase` no cabeçalho (correção, feedback do usuário, 2026-08-16)**:
 * o `<thead>` aplicava `text-transform: uppercase` via Tailwind em cima do
 * texto já formatado das colunas (`COLUMNS` abaixo) — visualmente correto
 * pra "Temperatura"/"Umidade", mas errado pras unidades que têm maiúscula
 * própria (`hPa`, não `HPA`; `mm` seguiria minúsculo, mas ficava `MM`).
 * `tracking-wide` mantém o cabeçalho com cara de cabeçalho de tabela sem
 * transformar o texto. O export CSV/XLSX (`api/src/exporters/`) usa nomes
 * técnicos (`pressure_hpa`, `rain_mm`) que nunca tiveram esse problema — só a
 * UI desta tabela precisava do ajuste.
 */
export interface ReadingsTableProps {
  readings: HistoryReading[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** `value` → texto de célula; `null`/`undefined` vira "—" (HIST-03). */
function formatCell(value: number | null): string {
  return value === null ? "—" : String(value);
}

const COLUMNS: { key: Exclude<keyof HistoryReading, "timestamp">; header: string }[] = [
  { key: "temperature_c", header: "Temperatura (°C)" },
  { key: "humidity_pct", header: "Umidade (%)" },
  { key: "pressure_hpa", header: "Pressão (hPa)" },
  { key: "rain_mm", header: "Chuva (mm)" },
  { key: "uv_index", header: "Índice UV" },
];

export function ReadingsTable({
  readings,
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: ReadingsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  if (readings.length === 0) {
    return (
      <Card className={className}>
        <CardContent>
          <EmptyState
            title="Nenhum dado no período"
            description="Ajuste o intervalo de datas ou tente novamente mais tarde."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <Table className="min-w-[640px]">
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead scope="col" className="px-4">
              Data/Hora
            </TableHead>
            {COLUMNS.map((column) => (
              <TableHead key={column.key} scope="col" className="px-4 text-right">
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {readings.map((reading) => (
            <TableRow key={reading.timestamp}>
              <TableCell className="px-4 font-medium">
                {formatDayMonth(reading.timestamp)} {formatTime(reading.timestamp)}
              </TableCell>
              {COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  className="px-4 text-right text-muted-foreground tabular-nums"
                >
                  {formatCell(reading[column.key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CardFooter className="justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
        <span>
          Página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGoPrev}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGoNext}
            onClick={() => onPageChange(page + 1)}
          >
            Próxima
            <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default ReadingsTable;
