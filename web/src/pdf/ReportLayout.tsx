import type { ReactNode } from "react";
import {
  CloudRainIcon,
  DropletsIcon,
  GaugeIcon,
  SunIcon,
  ThermometerIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metric } from "../api-client";
import type { MetricMeta } from "./reportData";

/**
 * Blocos visuais compartilhados pelos relatórios em PDF (`DashboardReport`,
 * `HistoryReport`). Cada `ReportPage` é uma folha A4 inteira em px (96 dpi),
 * e `renderReportToPdf` captura cada uma separadamente com o `html2canvas-pro`.
 * Por isso a paginação é decidida AQUI, no layout (quantos cards/linhas cabem
 * por folha), e nunca por um corte automático no meio de um card ou linha.
 *
 * Paleta fixa do Tailwind (`slate`/`emerald`), nunca os tokens do tema
 * (`bg-background`, `text-foreground`…): o relatório é sempre claro, mesmo
 * quando o usuário exporta com o modo escuro ativo.
 */
export const PAGE_WIDTH_PX = 794;
export const PAGE_HEIGHT_PX = 1123;
/** Largura útil dentro do padding lateral da página (44px de cada lado). */
export const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - 88;

export const METRIC_ICONS: Record<Metric, LucideIcon> = {
  temperature_c: ThermometerIcon,
  humidity_pct: DropletsIcon,
  pressure_hpa: GaugeIcon,
  rain_mm: CloudRainIcon,
  uv_index: SunIcon,
};

export interface ReportPageProps {
  pageNumber: number;
  totalPages: number;
  /** Nome do documento, repetido no rodapé de toda página. */
  documentTitle: string;
  children: ReactNode;
}

export function ReportPage({ pageNumber, totalPages, documentTitle, children }: ReportPageProps) {
  return (
    <section
      data-report-page={pageNumber}
      className="relative flex flex-col overflow-hidden bg-white font-sans text-slate-800"
      style={{ width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX, padding: "40px 44px 28px" }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6">{children}</div>

      <footer className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
        <span>
          <span className="font-semibold text-emerald-700">IFSClima</span> · {documentTitle}
        </span>
        <span>
          Página {pageNumber} de {totalPages}
        </span>
      </footer>
    </section>
  );
}

export interface ReportMetaItem {
  label: string;
  value: string;
}

export interface ReportHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  meta: ReportMetaItem[];
}

/** Cabeçalho da primeira página: faixa verde com título, logo institucional e metadados do documento. */
export function ReportHero({ eyebrow, title, description, meta }: ReportHeroProps) {
  return (
    <header
      className="flex flex-col gap-5 rounded-2xl px-7 py-6 text-white"
      style={{ background: "linear-gradient(135deg, #065f46 0%, #047857 45%, #10b981 100%)" }}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-emerald-100 uppercase">
            {eyebrow}
          </span>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
          <p className="max-w-[420px] text-[12px] leading-relaxed text-emerald-50/90">
            {description}
          </p>
        </div>
        <img
          src="/jaragua-centro-logo-dark-theme.png"
          alt="Instituto Federal de Santa Catarina — Câmpus Jaraguá do Sul – Centro"
          className="h-11 w-auto shrink-0"
        />
      </div>

      <dl className="grid grid-cols-4 gap-2">
        {meta.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5 rounded-xl bg-white/12 px-3 py-2">
            <dt className="text-[9px] font-medium tracking-wider text-emerald-100 uppercase">
              {item.label}
            </dt>
            <dd className="text-[12px] font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/** Cabeçalho das páginas seguintes: título da seção + logo institucional discreto. */
export function ReportContinuationHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex items-center justify-between gap-6 border-b border-slate-200 pb-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
      <img
        src="/jaragua-centro-logo-light-theme.png"
        alt="Instituto Federal de Santa Catarina"
        className="h-8 w-auto shrink-0 opacity-80"
      />
    </header>
  );
}

export function ReportSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[13px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {hint ? <span className="text-[10px] text-slate-400">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Chip colorido com o ícone do sensor. A cor vai por `color` porque o SVG do lucide é serializado como imagem. */
export function MetricIcon({ meta, size = 16 }: { meta: MetricMeta; size?: number }) {
  const Icon = METRIC_ICONS[meta.metric];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: meta.soft, width: size + 14, height: size + 14 }}
    >
      <Icon color={meta.color} size={size} strokeWidth={2.2} aria-hidden="true" />
    </span>
  );
}

export function ReportCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** Estado vazio de uma seção inteira (ex.: intervalo sem leituras). */
export function ReportEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <span className="text-[13px] font-semibold text-slate-700">{title}</span>
      <span className="text-[11px] text-slate-500">{description}</span>
    </div>
  );
}
