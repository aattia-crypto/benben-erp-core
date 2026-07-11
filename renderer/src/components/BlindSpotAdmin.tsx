import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { BlindSpotCreateDialog } from "@/components/BlindSpotCreateDialog";
import { BlindSpotHelpSection } from "@/components/BlindSpotHelpSection";
import { BlindSpotVideoPlayer } from "@/components/BlindSpotAlertCard";
import { PageHeader, Panel, Pill, erp } from "@/components/ui-bits";
import {
  categoryLabel,
  severityLabel,
  targetBindingLabel,
} from "@/lib/blind-spot-labels";
import {
  deleteBlindSpotEntry,
  getBlindSpotEntries,
  hydrateBlindSpotStore,
  subscribeBlindSpotStore,
} from "@/lib/blind-spot-store";

function severityTone(severity: string): "danger" | "warning" | "neutral" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "neutral";
}

export function BlindSpotAdmin() {
  const [, tick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => subscribeBlindSpotStore(() => tick((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void hydrateBlindSpotStore()
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not load vault entries.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = getBlindSpotEntries();

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Remove vault entry "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteBlindSpotEntry(id);
      toast.success("Vault entry removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete entry.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tribal Knowledge Vault"
        subtitle="Manage blind-spot ledger entries that surface as contextual operator guidance in manufacturing and sales."
        actions={
          <button type="button" className={erp.actionBtn} onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 inline h-3.5 w-3.5" /> Add Vault Entry
          </button>
        }
      />

      <BlindSpotHelpSection />

      <Panel padded={false} title="Vault entries">
        {loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading vault entries…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No entries yet. Click <strong>Add Vault Entry</strong> to capture your first tribal knowledge note.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Severity</th>
                <th className="px-4 py-2 text-left">Target</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="font-medium text-foreground">{entry.title}</div>
                    {entry.videoFilePath ? (
                      <BlindSpotVideoPlayer videoFilePath={entry.videoFilePath} />
                    ) : (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{entry.body}</div>
                    )}
                    {entry.voiceTranscript ? (
                      <div className="mt-1 text-xs italic text-muted-foreground">{entry.voiceTranscript}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{categoryLabel(entry.category)}</td>
                  <td className="px-4 py-2">
                    <Pill tone={severityTone(entry.severity)}>{severityLabel(entry.severity)}</Pill>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {targetBindingLabel(entry)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-destructive disabled:opacity-50"
                      disabled={deletingId === entry.id}
                      onClick={() => void handleDelete(entry.id, entry.title)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingId === entry.id ? "Removing…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <BlindSpotCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSaved={() => tick((n) => n + 1)}
      />
    </div>
  );
}
