import { useState } from "react";
import { FileDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botão "Exportar PDF" compartilhado por `DashboardPage` e `HistoryPage`.
 * Fica desabilitado enquanto a geração está em andamento (buscar os dados,
 * montar o relatório e capturar as páginas leva alguns segundos), com a
 * guarda também no handler contra clique duplo. Mostra uma mensagem de erro
 * (`role="alert"`) se a exportação falhar, sem derrubar a página.
 */
export interface ExportPdfButtonProps {
  onExport: () => Promise<void>;
  disabled?: boolean;
  variant?: "default" | "outline";
}

export function ExportPdfButton({
  onExport,
  disabled = false,
  variant = "default",
}: ExportPdfButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  async function handleClick() {
    if (isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError(false);
    try {
      await onExport();
    } catch {
      setExportError(true);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <Button
        type="button"
        size="sm"
        variant={variant}
        onClick={handleClick}
        disabled={disabled || isExporting}
      >
        <FileDownIcon aria-hidden="true" data-icon="inline-start" />
        {isExporting ? "Gerando PDF…" : "Exportar PDF"}
      </Button>
      {exportError ? (
        <span role="alert" className="text-xs text-destructive">
          Não foi possível gerar o PDF. Tente novamente.
        </span>
      ) : null}
    </div>
  );
}

export default ExportPdfButton;
