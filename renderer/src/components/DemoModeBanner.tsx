import { useState } from "react";
import { FlaskConical, Trash2 } from "lucide-react";
import { clearDemoData } from "@/lib/demo-mode";
import { useIsDemoMode } from "@/hooks/use-demo-data";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  compact?: boolean;
  className?: string;
};

export function DemoModeBanner({ compact = false, className = "" }: Props) {
  const isDemoMode = useIsDemoMode();
  const [open, setOpen] = useState(false);

  if (!isDemoMode) return null;

  function handleConfirm() {
    clearDemoData();
    setOpen(false);
    toast.success("Demo data cleared. Your workspace is ready for real data.");
  }

  return (
    <>
      <div
        className={`rounded-md border border-warning/40 bg-warning/10 ${compact ? "p-2" : "p-3"} ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <div className={`font-semibold text-warning ${compact ? "text-[11px]" : "text-xs"}`}>
              Running in Demo Mode (Sample Data)
            </div>
            {!compact && (
              <div className="text-[11px] leading-snug text-muted-foreground">
                Explore the ERP with bundled examples. Clear when you are ready to enter live data.
              </div>
            )}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`mt-1.5 inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 font-medium text-warning hover:bg-warning/20 ${
                compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
              }`}
            >
              <Trash2 className="h-3 w-3" /> Clear Demo Data & Start Fresh
            </button>
          </div>
        </div>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear demo data and start fresh?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently clear the sandbox environment: sample customers, vendors, production
              batches, inventory, purchase orders, import shipments, ledger entries, POS sales, and loyalty
              records. Your workspace will switch to a clean, empty state for real business data. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-danger text-white hover:bg-danger/90">
              Yes, clear demo data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
