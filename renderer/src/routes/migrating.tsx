import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { executeLocalStorageMigration } from "@/lib/migration-bootstrap";

export const Route = createFileRoute("/migrating")({
  head: () => ({
    meta: [{ title: "Upgrading — Benben ERP" }],
  }),
  component: MigratingPage,
});

type Phase = "running" | "success" | "error";

function MigratingPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("running");
  const [message, setMessage] = useState("Securing your operational data in PostgreSQL…");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await executeLocalStorageMigration();
      if (cancelled) return;

      if (result.action === "skip") {
        navigate({ to: "/" });
        return;
      }

      if (result.action === "error") {
        setPhase("error");
        setMessage("Migration could not complete");
        setDetail(result.error);
        return;
      }

      setPhase("success");
      setMessage("Data secured. Starting Benben ERP…");
      const counts = result.moduleCounts;
      if (counts && Object.keys(counts).length > 0) {
        setDetail(
          Object.entries(counts)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · "),
        );
      }
      window.setTimeout(() => {
        if (!cancelled) navigate({ to: "/" });
      }, 1200);
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      {phase === "running" && (
        <Loader2 className="mb-6 h-10 w-10 animate-spin text-brand" aria-hidden />
      )}
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {phase === "error" ? "Upgrade interrupted" : "Upgrading your workspace"}
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">{message}</p>
      {detail && (
        <p className="mt-4 max-w-lg font-mono text-xs text-muted-foreground">{detail}</p>
      )}
      {phase === "error" && (
        <button
          type="button"
          className="mt-8 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      )}
    </div>
  );
}
