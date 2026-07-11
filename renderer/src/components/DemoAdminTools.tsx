import { useState } from "react";
import { FlaskConical, Trash2, RefreshCcw, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Panel, erp } from "@/components/ui-bits";
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
import { useIsDemoMode } from "@/hooks/use-demo-data";
import { isAdmin } from "@/lib/rbac";
import {
  getDemoEnvironmentStatus,
  runDemoEnvironmentReset,
  type DemoResetProgress,
} from "@/lib/demo-admin";
import { setDemoMode } from "@/lib/demo-mode";

export function DemoAdminTools() {
  const isDemo = useIsDemoMode();
  const admin = isAdmin();
  const status = getDemoEnvironmentStatus();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DemoResetProgress | null>(null);
  const [dialog, setDialog] = useState<"clear" | "reseed" | "full" | null>(null);
  const [preserveWorkspace, setPreserveWorkspace] = useState(true);
  const [reseedAfter, setReseedAfter] = useState(false);

  if (!admin) {
    return (
      <Panel title="Demo tools (admin only)">
        <p className="text-sm text-muted-foreground">
          Sign in as an administrator to clear or restore demo environment data.
        </p>
      </Panel>
    );
  }

  async function executeReset(mode: "clear" | "reseed" | "full") {
    setBusy(true);
    setProgress({ step: "Starting…", percent: 5 });
    try {
      if (mode === "reseed" || mode === "full") {
        setDemoMode(true);
        await runDemoEnvironmentReset(
          { preserveWorkspace: mode === "full" ? false : preserveWorkspace, reseedAfter: true, clearAuxiliaryKeys: true },
          setProgress,
        );
        return;
      }
      setDemoMode(false);
      await runDemoEnvironmentReset(
        {
          preserveWorkspace,
          reseedAfter: reseedAfter,
          clearAuxiliaryKeys: true,
        },
        setProgress,
      );
      toast.success(reseedAfter ? "Demo data cleared and reloaded." : "Demo transactional data cleared.");
      if (!reseedAfter) {
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch (e) {
      console.error(e);
      toast.error("Demo reset failed.");
    } finally {
      setBusy(false);
      setDialog(null);
      setProgress(null);
    }
  }

  return (
    <Panel title="Demo environment (system)">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-surface text-warning">
          <FlaskConical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">
            {isDemo ? "Demo mode active" : "Production sandbox (demo off)"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.moduleKeyCount} module data keys present in local storage. Clearing removes
            transactional samples from all ERP modules; workspace name and login are preserved when
            selected below.
          </p>
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={preserveWorkspace}
          onChange={(e) => setPreserveWorkspace(e.target.checked)}
        />
        Preserve workspace / company name
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={reseedAfter}
          onChange={(e) => setReseedAfter(e.target.checked)}
        />
        Re-seed demo data after clear (reload required)
      </label>

      {progress && (
        <div className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {progress.step}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className={erp.secondaryBtn}
          onClick={() => setDialog("clear")}
        >
          <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Clear demo data
        </button>
        <button
          type="button"
          disabled={busy}
          className={erp.actionBtn}
          onClick={() => setDialog("reseed")}
        >
          <RefreshCcw className="mr-1 inline h-3.5 w-3.5" /> Reset &amp; reseed demo
        </button>
        <button
          type="button"
          disabled={busy}
          className={erp.secondaryBtn}
          onClick={() => setDialog("full")}
        >
          <Database className="mr-1 inline h-3.5 w-3.5" /> Full demo reset
        </button>
      </div>

      <AlertDialog open={dialog === "clear"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all demo transactional data?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes sample inventory, orders, AR/AP, manufacturing, POS sales, and related module
              storage. {preserveWorkspace ? "Your company name will be kept." : "Workspace branding will also reset."}
              {reseedAfter ? " The app will reload with fresh demo seeds." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => void executeReset("clear")}
            >
              Clear data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "reseed"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset demo environment?</AlertDialogTitle>
            <AlertDialogDescription>
              Wipes module storage and reloads the application with bundled demo samples across all
              modules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void executeReset("reseed")}>
              Reset &amp; reseed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "full"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Full demo reset?</AlertDialogTitle>
            <AlertDialogDescription>
              Clears workspace branding and all module keys, then reloads with default demo seeds.
              Use for a completely fresh training environment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => void executeReset("full")}
            >
              Full reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
