import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  executePrintReport,
  PRINT_REPORT_SHEET_CLASS,
  PRINT_REPORT_SHEET_STYLES,
} from "@/lib/export-service";
import {
  closePrintPreview,
  getPrintPreviewState,
  subscribePrintPreview,
} from "@/lib/print-preview-store";

/** Global print preview — mounted once at the app root. */
export function PrintPreviewDialog() {
  const [preview, setPreview] = useState(getPrintPreviewState);

  useEffect(() => subscribePrintPreview(() => setPreview(getPrintPreviewState())), []);

  async function handleConfirmPrint() {
    try {
      await executePrintReport(preview.html, preview.title);
      closePrintPreview();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Print failed");
    }
  }

  return (
    <Dialog
      open={preview.open}
      onOpenChange={(open) => {
        if (!open) closePrintPreview();
      }}
    >
      <DialogContent
        className="flex max-h-[92vh] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 shadow-2xl shadow-black/50 [&>button]:text-zinc-400 [&>button]:hover:text-zinc-100"
      >
        <DialogHeader className="space-y-1 border-b border-zinc-800 bg-zinc-950 px-6 py-4 pr-12">
          <DialogTitle className="text-base font-semibold text-zinc-50">Print preview</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Review the report layout below. Confirm to open the system print dialog for{" "}
            <span className="font-medium text-zinc-200">{preview.title}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-zinc-900/80 px-6 py-5">
          <div className="mx-auto max-w-[48rem] rounded-md border border-zinc-700/80 bg-zinc-800/40 p-4 shadow-inner">
            <div className="overflow-hidden rounded-sm bg-white shadow-lg ring-1 ring-zinc-300/40">
              <style>{PRINT_REPORT_SHEET_STYLES}</style>
              <div
                className={PRINT_REPORT_SHEET_CLASS}
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-zinc-800 bg-zinc-950 px-6 py-4 sm:justify-end">
          <button
            type="button"
            onClick={() => closePrintPreview()}
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmPrint}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400"
          >
            <Printer className="h-4 w-4" />
            Confirm Print
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
