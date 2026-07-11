import { useState } from "react";
import { Download, ChevronDown, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildPrintTableHtml,
  exportCsv,
  exportPdf,
  exportXlsx,
  printReport,
  type ExportColumn,
  type ExportMeta,
} from "@/lib/export-service";
import { erp } from "@/components/ui-bits";

type ExportMenuProps = {
  filenameBase: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  meta?: ExportMeta;
  className?: string;
  showPrint?: boolean;
};

/** Single Export control with PDF / Excel / CSV dropdown (replaces separate buttons). */
export function ExportMenu({
  filenameBase,
  columns,
  rows,
  meta,
  className = "",
  showPrint = true,
}: ExportMenuProps) {
  const [busy, setBusy] = useState(false);
  const stamp = new Date().toISOString().slice(0, 10);

  async function run(label: string, fn: () => void | Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast.success(`${label} ready`);
    } catch (e) {
      console.error(e);
      toast.error(`${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {showPrint && (
        <button
          type="button"
          disabled={busy || rows.length === 0}
          className={erp.secondaryBtn}
          onClick={() =>
            run("Print", () => printReport(buildPrintTableHtml(columns, rows, meta), meta?.title ?? filenameBase))
          }
        >
          <Printer className="mr-1 inline h-3.5 w-3.5" /> Print
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={busy} className={erp.actionBtn}>
            <Download className="mr-1 inline h-3.5 w-3.5" />
            Export
            <ChevronDown className="ml-1 inline h-3.5 w-3.5 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => run("PDF", () => exportPdf(`${filenameBase}-${stamp}.pdf`, columns, rows, meta))}
          >
            <FileText className="mr-2 h-4 w-4" /> Export PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("Excel", () => exportXlsx(`${filenameBase}-${stamp}.xlsx`, columns, rows, meta))}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("CSV", () => exportCsv(`${filenameBase}-${stamp}.csv`, columns, rows, meta))}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
