import { useState } from "react";
import { FlaskConical, Database } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/ui-bits";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { useIsDemoMode } from "@/hooks/use-demo-data";
import { restoreDemoSampleData } from "@/lib/demo-mode";

export function DemoWorkspacePanel() {
  const isDemoMode = useIsDemoMode();
  const [confirmRestore, setConfirmRestore] = useState(false);

  return (
    <Panel title="Demo & workspace data">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-surface text-warning">
          <FlaskConical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {isDemoMode ? "Running in Demo Mode (Sample Data)" : "Production workspace (no sample data)"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isDemoMode
              ? "Explore the ERP with bundled examples. Clear demo data when you are ready to enter real records."
              : "Sample data was cleared. Modules show empty tables until you add your own data."}
          </p>
        </div>
      </div>

      {isDemoMode ? (
        <div className="mt-4">
          <DemoModeBanner />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            To see the demo banner and sample batches, customers, and inventory again, restore sample data below.
          </p>
          {!confirmRestore ? (
            <button
              type="button"
              onClick={() => setConfirmRestore(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-surface"
            >
              <Database className="h-3.5 w-3.5" /> Restore sample data
            </button>
          ) : (
            <div className="rounded-md border border-border bg-surface p-3 text-xs">
              <p className="text-muted-foreground">
                This reloads the app with demo batches, CRM entities, inventory, and ledger examples.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-card"
                  onClick={() => setConfirmRestore(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-brand px-2.5 py-1 font-medium text-brand-foreground"
                  onClick={() => {
                    restoreDemoSampleData();
                    toast.message("Reloading with sample data…");
                  }}
                >
                  Confirm restore
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
