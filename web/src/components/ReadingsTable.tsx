import type { HistoryReading } from "../api-client";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { formatDayMonth, formatTime } from "../utils/formatTime";

/**
 * `ReadingsTable` (F8 T8.6, design.md "Frontend — página /historico") —
 * tabela paginada de leituras brutas (HIST-01..HIST-04). Reusa `Card` (F5,
 * container) e `EmptyState` (F5, intervalo sem dados) em vez de recriar
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
  className = "",
}: ReadingsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  if (readings.length === 0) {
    return (
      <Card className={className.trim()}>
        <EmptyState
          title="Nenhum dado no período"
          description="Ajuste o intervalo de datas ou tente novamente mais tarde."
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className={className.trim()}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-surface-table-header text-xs font-semibold uppercase text-text-tertiary">
            <tr>
              <th scope="col" className="whitespace-nowrap px-4 py-3">
                Data/Hora
              </th>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-3">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readings.map((reading) => (
              <tr key={reading.timestamp} className="border-t border-border-subtle">
                <td className="whitespace-nowrap px-4 py-3 text-text-primary">
                  {formatDayMonth(reading.timestamp)} {formatTime(reading.timestamp)}
                </td>
                {COLUMNS.map((column) => (
                  <td key={column.key} className="whitespace-nowrap px-4 py-3 text-text-secondary">
                    {formatCell(reading[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-3 text-xs text-text-tertiary">
        <span>
          Página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-border-default px-3 py-1.5 font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-border-default px-3 py-1.5 font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>
    </Card>
  );
}

export default ReadingsTable;
