import { Panel, Pill } from "@/components/ui-bits";
import type { POLogEntry, POStatus } from "@/lib/purchasing-store";

const ACTION_LABELS: Record<POLogEntry["action"], string> = {
  created: "Created",
  submitted: "Submitted for approval",
  approved: "Approved by finance",
  denied: "Denied by finance",
  received: "Goods received",
};

function statusLabel(status?: POStatus): string {
  return status ? status.replace(/_/g, " ") : "n/a";
}

type PoLogPanelProps = {
  poNumber: string;
  logs: POLogEntry[];
  loading?: boolean;
  denialReason?: string;
};

export function PoLogPanel({ poNumber, logs, loading, denialReason }: PoLogPanelProps) {
  return (
    <Panel title={"PO log: " + poNumber}>
      {denialReason ? (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Denial reason: {denialReason}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading activity...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {logs.map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{ACTION_LABELS[entry.action]}</span>
                  {entry.fromStatus && entry.toStatus ? (
                    <Pill tone="neutral">
                      {statusLabel(entry.fromStatus)} to {statusLabel(entry.toStatus)}
                    </Pill>
                  ) : null}
                </div>
                {entry.comment ? <p className="mt-0.5 text-muted-foreground">{entry.comment}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.actorName ? entry.actorName + " - " : ""}
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
