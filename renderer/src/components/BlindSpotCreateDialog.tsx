import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Film, Upload, X } from "lucide-react";
import { ErpFormDialog } from "@/components/ErpFormDialog";
import { erp, ErpFieldLabel } from "@/components/ui-bits";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import {
  BLIND_SPOT_CATEGORY_OPTIONS,
  BLIND_SPOT_SEVERITY_OPTIONS,
  getPathForDroppedFile,
  isVideoFile,
} from "@/lib/blind-spot-labels";
import {
  createEntry,
  type BlindSpotCategory,
  type BlindSpotSeverity,
} from "@/lib/blind-spot-store";
import { desktopPickFile, isDesktopShell } from "@/lib/desktop-api";
import { getEntities, subscribeCrm } from "@/lib/crm-store";

type TargetBinding = "global" | "sku" | "customer";

type VaultForm = {
  title: string;
  body: string;
  category: BlindSpotCategory;
  severity: BlindSpotSeverity;
  binding: TargetBinding;
  sku: string;
  customerId: string;
};

type PendingVideo = {
  label: string;
  sourcePath: string;
};

function clientOptions() {
  return getEntities().filter((e) => e.kind === "client" || e.kind === "both");
}

function emptyForm(): VaultForm {
  return {
    title: "",
    body: "",
    category: "operational",
    severity: "high",
    binding: "global",
    sku: "",
    customerId: "",
  };
}

type BlindSpotCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function BlindSpotCreateDialog({ open, onOpenChange, onSaved }: BlindSpotCreateDialogProps) {
  const [form, setForm] = useState<VaultForm>(emptyForm);
  const [pendingVideo, setPendingVideo] = useState<PendingVideo | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, tick] = useState(0);
  const { items } = useProductCatalog();
  const clients = clientOptions();

  useEffect(() => subscribeCrm(() => tick((n) => n + 1)), []);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setPendingVideo(null);
      setDragOver(false);
    }
  }, [open]);

  const attachVideoFile = useCallback((file: File) => {
    if (!isVideoFile(file)) {
      toast.error("Drop a video file (MP4, WebM, MOV, etc.).");
      return;
    }
    const sourcePath = getPathForDroppedFile(file);
    if (!sourcePath) {
      toast.error("Could not read video path. Use Browse or run inside the desktop app.");
      return;
    }
    setPendingVideo({ label: file.name, sourcePath });
    setForm((f) => ({
      ...f,
      title: f.title.trim() || file.name.replace(/\.[^.]+$/, ""),
    }));
  }, []);

  async function browseVideo() {
    if (!isDesktopShell()) {
      toast.error("Video upload requires the Benben desktop app.");
      return;
    }
    const path = await desktopPickFile([
      { name: "Video", extensions: ["mp4", "webm", "mov", "mkv", "m4v"] },
    ]);
    if (!path) return;
    const label = path.split(/[/\\]/).pop() ?? path;
    setPendingVideo({ label, sourcePath: path });
    setForm((f) => ({
      ...f,
      title: f.title.trim() || label.replace(/\.[^.]+$/, ""),
    }));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) attachVideoFile(file);
  }

  function validate(): string | null {
    if (!form.title.trim()) return "Title is required.";
    if (!form.body.trim() && !pendingVideo) return "Add a video clip or short text context.";
    if (form.binding === "sku" && !form.sku.trim()) return "Select an inventory SKU.";
    if (form.binding === "customer" && !form.customerId) return "Select a CRM customer.";
    if (form.binding === "sku" && items.length === 0) return "Add inventory SKUs before binding to a product.";
    if (form.binding === "customer" && clients.length === 0) return "Create a CRM client before binding to a customer.";
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    const selectedClient = clients.find((c) => c.id === form.customerId);
    setSaving(true);
    try {
      await createEntry({
        title: form.title,
        body: form.body,
        category: form.category,
        severity: form.severity,
        sku: form.binding === "sku" ? form.sku.trim() : undefined,
        partyId: form.binding === "customer" ? selectedClient?.id : undefined,
        customerCode: form.binding === "customer" ? selectedClient?.code : undefined,
        videoSourcePath: pendingVideo?.sourcePath,
      });
      toast.success(pendingVideo ? "Video vault entry saved." : "Vault entry saved.");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save vault entry.");
    } finally {
      setSaving(false);
    }
  }

  const hasVideo = !!pendingVideo;

  return (
    <ErpFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Vault Entry"
      description="Drop a shop-floor video or type a note — bind it to a SKU or customer for automatic alerts."
      submitLabel={saving ? "Saving…" : "Save entry"}
      submitDisabled={saving}
      onSubmit={() => void handleSave()}
      size="lg"
    >
      <div className="space-y-4">
        <div>
          <ErpFieldLabel>Video clip (optional)</ErpFieldLabel>
          <div
            className={
              dragOver
                ? "mt-1 flex min-h-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-brand bg-brand/5 p-4 text-center"
                : "mt-1 flex min-h-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface/50 p-4 text-center"
            }
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {pendingVideo ? (
              <div className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Film className="h-4 w-4 shrink-0 text-brand" />
                  <span className="truncate font-medium">{pendingVideo.label}</span>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setPendingVideo(null)}
                  aria-label="Remove video"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop a video here, or{" "}
                  <button type="button" className="text-brand underline" onClick={() => void browseVideo()}>
                    browse files
                  </button>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">MP4, WebM, MOV — stored locally on this machine</p>
              </>
            )}
          </div>
        </div>

        <div>
          <ErpFieldLabel>Title</ErpFieldLabel>
          <input
            id="bs-title"
            className={erp.input}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={hasVideo ? "Short label for this clip" : "e.g. Anneals slowly above 400°C"}
          />
        </div>

        {!hasVideo && (
          <div>
            <ErpFieldLabel>Context / body</ErpFieldLabel>
            <textarea
              id="bs-body"
              className={`${erp.input} min-h-[100px] resize-y`}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Explain the quirk, client preference, or machine limit in plain language."
            />
          </div>
        )}

        {hasVideo && (
          <p className="text-xs text-muted-foreground">
            Text context is optional when you attach a video — operators will play the clip from alert cards and the vault
            table.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <ErpFieldLabel>Category</ErpFieldLabel>
            <select
              id="bs-category"
              className={erp.input}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BlindSpotCategory }))}
            >
              {BLIND_SPOT_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <ErpFieldLabel>Severity</ErpFieldLabel>
            <select
              id="bs-severity"
              className={erp.input}
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as BlindSpotSeverity }))}
            >
              {BLIND_SPOT_SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <ErpFieldLabel>Target binding</ErpFieldLabel>
          <div className="mt-1 flex flex-wrap gap-2">
            {(
              [
                { value: "global", label: "Global" },
                { value: "sku", label: "Inventory SKU" },
                { value: "customer", label: "CRM Customer" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={
                  form.binding === opt.value
                    ? "rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand"
                    : "rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface"
                }
                onClick={() => setForm((f) => ({ ...f, binding: opt.value, sku: "", customerId: "" }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {form.binding === "sku" && (
          <div>
            <ErpFieldLabel>Inventory SKU</ErpFieldLabel>
            <select
              id="bs-sku"
              className={erp.input}
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            >
              <option value="">Select SKU…</option>
              {items.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {form.binding === "customer" && (
          <div>
            <ErpFieldLabel>CRM customer</ErpFieldLabel>
            <select
              id="bs-customer"
              className={erp.input}
              value={form.customerId}
              onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
            >
              <option value="">Select customer…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </ErpFormDialog>
  );
}
