import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Database, FileUp, Loader2, Paperclip, Terminal } from "lucide-react";
import { PageHeader, Panel, Pill, fmtMoney, erp, ErpFieldLabel } from "@/components/ui-bits";
import { ExportToolbar } from "@/components/ExportToolbar";
import {
  applyLandedCostToInventory,
  attachFile,
  computeLandedCost,
  getShipments,
  merchandiseValue,
  subscribeImports,
  updateShipment,
} from "@/lib/imports-store";
import { desktopPickFile, isDesktopShell } from "@/lib/desktop-api";
import { isDemoBuild } from "@/lib/demo-build";

export const Route = createFileRoute("/imports")({
  head: () => ({
    meta: [
      { title: "Imports — Benben ERP" },
      { name: "description", content: "Import documentation, customs, landed cost, and shipment tracking." },
    ],
  }),
  component: ImportsPage,
});

type LegacySourceTemplate = "excel" | "quickbooks" | "erpnext" | "sap";

const LEGACY_SOURCE_OPTIONS: { id: LegacySourceTemplate; label: string }[] = [
  { id: "excel", label: "Excel / CSV Master" },
  { id: "quickbooks", label: "QuickBooks Online" },
  { id: "erpnext", label: "ERPNext" },
  { id: "sap", label: "Legacy SAP" },
];

const LEGACY_TEMPLATE_FILES: Record<LegacySourceTemplate, { name: string; size: string }> = {
  excel: { name: "legacy_bom_and_inventory.csv", size: "4.2 MB" },
  quickbooks: { name: "quickbooks_items_and_vendors_export.csv", size: "6.8 MB" },
  erpnext: { name: "erpnext_master_data_bundle.json", size: "3.1 MB" },
  sap: { name: "sap_idoc_masterdata_extract.xml", size: "9.4 MB" },
};

type LegacyMigrationStep = { id: string; label: string; delayMs: number };

function legacyMigrationSteps(template: LegacySourceTemplate): LegacyMigrationStep[] {
  const file = LEGACY_TEMPLATE_FILES[template];
  return [
    {
      id: "reading",
      label: `[READING] Processing local flat file: ${file.name} (${file.size})...`,
      delayMs: 1200,
    },
    {
      id: "parsing",
      label: "[PARSING] Mapping local relational database schemas...",
      delayMs: 1000,
    },
    {
      id: "validating",
      label: "[VALIDATING] Checking product SKU integrity and accounting ledger constraints...",
      delayMs: 1500,
    },
    {
      id: "success",
      label:
        "[SUCCESS] Cleanly imported 142 Bill of Materials (BOM) patterns and 3 Master Vendor records into local PostgreSQL instance!",
      delayMs: 0,
    },
  ];
}

type LegacyStepStatus = "pending" | "active" | "done";

/** Presenter / demo build only — legacy migration sales simulator. */
function DemoLegacyMigrationSimulator() {
  const [template, setTemplate] = useState<LegacySourceTemplate>("excel");
  const [dragOver, setDragOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [stepStates, setStepStates] = useState<Record<string, LegacyStepStatus>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const displayFile = droppedFile ?? LEGACY_TEMPLATE_FILES[template].name;
  const steps = legacyMigrationSteps(template);

  const onBrowse = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFilePicked = useCallback((file: File | null) => {
    if (!file) return;
    setDroppedFile(file.name);
    setCompleted(false);
    setStepStates({});
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFilePicked(file);
    },
    [onFilePicked],
  );

  async function runMigration() {
    if (running) return;
    setRunning(true);
    setCompleted(false);
    const initial: Record<string, LegacyStepStatus> = {};
    steps.forEach((s) => {
      initial[s.id] = "pending";
    });
    setStepStates(initial);

    for (const step of steps) {
      setStepStates((prev) => ({ ...prev, [step.id]: "active" }));
      if (step.delayMs > 0) {
        await new Promise((r) => setTimeout(r, step.delayMs));
      }
      setStepStates((prev) => ({ ...prev, [step.id]: "done" }));
    }

    setRunning(false);
    setCompleted(true);
  }

  return (
    <Panel title="Legacy Data Migration">
      <p className="mb-4 text-sm text-muted-foreground">
        Simulate migrating master data from QuickBooks, Excel, ERPNext, or SAP into your local
        PostgreSQL database — no cloud upload required.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="block">
            <ErpFieldLabel>Source System Template</ErpFieldLabel>
            <select
              className={`mt-1 w-full ${erp.input}`}
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value as LegacySourceTemplate);
                setCompleted(false);
                setStepStates({});
              }}
              disabled={running}
            >
              {LEGACY_SOURCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onBrowse();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={onBrowse}
            className={
              dragOver
                ? "mt-4 flex min-h-[148px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-brand bg-brand/5 p-6 text-center transition-colors"
                : "mt-4 flex min-h-[148px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface/50 p-6 text-center transition-colors hover:border-brand/40 hover:bg-surface"
            }
          >
            <FileUp className="mb-2 h-8 w-8 text-brand" aria-hidden />
            <p className="text-sm font-medium text-foreground">Drag &amp; Drop Legacy Data Export</p>
            <p className="mt-1 text-xs text-muted-foreground">
              or click to browse · CSV, XLSX, JSON, XML
            </p>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">{displayFile}</p>
          </div>

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls,.json,.xml"
            onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
          />

          <button
            type="button"
            className={`mt-4 w-full ${erp.actionBtn}`}
            disabled={running}
            onClick={() => void runMigration()}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Migration in progress...
              </>
            ) : (
              <>
                <Database className="mr-2 inline h-4 w-4" />
                Initiate Local Migration Sync
              </>
            )}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-slate-950 text-slate-100">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
            <Terminal className="h-3.5 w-3.5" />
            Migration progress
          </div>
          <ul className="space-y-2 p-3 font-mono text-xs leading-relaxed">
            {steps.map((step) => {
              const status = stepStates[step.id] ?? "pending";
              return (
                <li key={step.id} className="flex gap-2">
                  {status === "done" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : status === "active" ? (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-brand" />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
                  )}
                  <span className={status === "pending" ? "text-slate-500" : "text-slate-200"}>
                    {step.label}
                  </span>
                </li>
              );
            })}
            {Object.keys(stepStates).length === 0 && !running && !completed ? (
              <li className="text-slate-500">Awaiting migration sync...</li>
            ) : null}
          </ul>
        </div>
      </div>

      {completed ? (
        <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <strong>Migration Completed Successfully.</strong> Local database tables updated.
        </div>
      ) : null}
    </Panel>
  );
}

function ImportsPage() {
  const [, tick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeImports(() => tick((n) => n + 1)), []);

  const shipments = getShipments();

  async function browseAttachment(shipmentId: string) {
    if (isDesktopShell()) {
      const path = await desktopPickFile([{ name: "Documents", extensions: ["pdf", "csv", "xlsx", "png", "jpg"] }]);
      if (path) {
        attachFile(shipmentId, path.split(/[/\\]/).pop() ?? path, 0);
        toast.success("Attachment recorded.");
      }
      return;
    }
    if (fileRef.current) {
      fileRef.current.dataset.shipmentId = shipmentId;
      fileRef.current.click();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        subtitle={
          isDemoBuild()
            ? "Legacy system migration simulator plus shipment tracking, customs, and landed cost."
            : "Shipment tracking, customs/tariff, landed cost allocation, and import documentation."
        }
        actions={
          <ExportToolbar
            filenameBase="imports"
            columns={[
              { key: "reference", label: "Reference" },
              { key: "origin", label: "Origin" },
              { key: "status", label: "Status" },
              { key: "landedCost", label: "Landed cost", align: "right", format: (v) => fmtMoney(Number(v)) },
              { key: "eta", label: "ETA" },
            ]}
            rows={shipments.map((s) => ({ ...s }))}
            meta={{ title: "Import Shipments" }}
          />
        }
      />

      {isDemoBuild() ? <DemoLegacyMigrationSimulator /> : null}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const id = fileRef.current?.dataset.shipmentId;
          if (f && id) {
            attachFile(id, f.name, f.size);
            toast.success(`Attached ${f.name}`);
          }
        }}
      />

      {shipments.length === 0 && !isDemoBuild() ? (
        <Panel title="No import shipments">
          <p className="text-sm text-muted-foreground">
            No inbound shipments recorded yet. Use shipment tracking below when import data is
            available.
          </p>
        </Panel>
      ) : null}

      {shipments.map((s) => {
        const fob = merchandiseValue(s);
        const duty = fob * (s.customsTariffPct / 100);
        const computed = computeLandedCost(s);
        return (
          <Panel key={s.id} title={s.reference}>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <ErpFieldLabel>Route</ErpFieldLabel>
                <div className="mt-1 text-sm">
                  {s.origin} → {s.destination}
                </div>
              </div>
              <div>
                <ErpFieldLabel>Status</ErpFieldLabel>
                <div className="mt-1">
                  <Pill tone="brand">{s.status.replace("_", " ")}</Pill>
                </div>
              </div>
              <div>
                <ErpFieldLabel>Customs tariff</ErpFieldLabel>
                <div className={`mt-1 ${erp.financial}`}>{s.customsTariffPct}%</div>
              </div>
              <div>
                <ErpFieldLabel>Landed cost (computed)</ErpFieldLabel>
                <div className={`mt-1 ${erp.total}`}>{fmtMoney(computed)}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 rounded-md border border-border bg-surface/50 p-3 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">FOB merchandise</span>
                <div className={erp.financial}>{fmtMoney(fob)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Ad-valorem duty</span>
                <div className={erp.financial}>{fmtMoney(duty)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Customs fees</span>
                <div className={erp.financial}>{fmtMoney(s.customsFees)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Freight + insurance</span>
                <div className={erp.financial}>{fmtMoney(s.freightCost + s.insuranceCost)}</div>
              </div>
            </div>

            <table className="mt-4 w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-1 text-left">SKU</th>
                  <th className="py-1 text-left">Description</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">FOB unit</th>
                  <th className="py-1 text-right">Line FOB</th>
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-1 font-mono text-xs">{l.sku}</td>
                    <td className="py-1">{l.description}</td>
                    <td className="py-1 text-right">{l.qty}</td>
                    <td className={`py-1 text-right ${erp.financial}`}>{fmtMoney(l.unitValue)}</td>
                    <td className={`py-1 text-right ${erp.financial}`}>{fmtMoney(l.qty * l.unitValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 flex flex-wrap gap-2">
              {(["booked", "in_transit", "customs", "delivered"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={erp.secondaryBtn}
                  onClick={() => {
                    updateShipment(s.id, { status: st });
                    toast.success("Status updated.");
                  }}
                >
                  Mark {st.replace("_", " ")}
                </button>
              ))}
              <button type="button" className={erp.actionBtn} onClick={() => browseAttachment(s.id)}>
                <Paperclip className="mr-1 inline h-3.5 w-3.5" /> Attach file
              </button>
              {!s.landedCostApplied && (
                <button
                  type="button"
                  className={erp.actionBtn}
                  onClick={() => {
                    if (applyLandedCostToInventory(s.id)) {
                      toast.success("Landed cost allocated to inventory unit costs.");
                    } else toast.error("Could not apply landed cost.");
                  }}
                >
                  Apply landed cost to inventory
                </button>
              )}
              {s.landedCostApplied && (
                <Pill tone="success">Cost applied to inventory</Pill>
              )}
            </div>
            {s.attachments.length > 0 && (
              <ul className="mt-3 text-xs text-muted-foreground">
                {s.attachments.map((a) => (
                  <li key={a.id}>
                    {a.name} · {(a.size / 1024).toFixed(1)} KB
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
