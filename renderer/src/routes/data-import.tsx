import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import { Download, Upload, History } from "lucide-react";
import type { ImportEntityType, ImportPreview } from "@/lib/data-import/types";
import { parseSpreadsheet } from "@/lib/data-import/parser";
import { buildPreview, commitImport } from "@/lib/data-import/engine";
import { downloadImportTemplate, targetFieldsFor } from "@/lib/data-import/templates";
import { getImportHistory, subscribeImportHistory } from "@/lib/data-import/history";

export const Route = createFileRoute("/data-import")({
  head: () => ({
    meta: [
      { title: "Data Import — Benben ERP" },
      { name: "description", content: "Import customers, vendors, products, GL accounts, and opening balances." },
    ],
  }),
  component: DataImportPage,
});

const ENTITIES: { id: ImportEntityType; label: string }[] = [
  { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" },
  { id: "products", label: "Inventory / products" },
  { id: "chart_of_accounts", label: "Chart of accounts" },
  { id: "beginning_inventory", label: "Beginning inventory balances" },
];

type Step = "choose" | "upload" | "map" | "preview" | "done";

function DataImportPage() {
  const [step, setStep] = useState<Step>("choose");
  const [entity, setEntity] = useState<ImportEntityType>("customers");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [, tick] = useState(0);

  useEffect(() => subscribeImportHistory(() => tick((n) => n + 1)), []);
  const history = getImportHistory();

  async function onFile(file: File) {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".csv") && !ext.endsWith(".xls")) {
      toast.error("Upload .xlsx or .csv only.");
      return;
    }
    const { headers, rows } = await parseSpreadsheet(file);
    if (rows.length === 0) {
      toast.error("File has no data rows.");
      return;
    }
    setFileName(file.name);
    setPreview(buildPreview(entity, headers, rows));
    setStep("map");
  }

  function updateMapping(targetField: string, sourceColumn: string) {
    if (!preview) return;
    const mapping = preview.mapping.map((m) =>
      m.targetField === targetField ? { ...m, sourceColumn } : m,
    );
    setPreview(buildPreview(entity, preview.headers, preview.rows, mapping));
  }

  function runImport() {
    if (!preview) return;
    const errCount = preview.issues.filter((i) => i.severity === "error").length;
    if (errCount > 0) {
      toast.error(`Fix ${errCount} validation error(s) before importing.`);
      return;
    }
    const { success, errors } = commitImport(preview, fileName, { skipDuplicates: true });
    setStep("done");
    toast.success(`Imported ${success} row(s)${errors ? `, ${errors} skipped` : ""}.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data import"
        subtitle="Onboard customers, vendors, products, GL accounts, and opening balances from Excel or CSV."
      />

      <div className="flex flex-wrap gap-2 text-xs">
        {(["choose", "upload", "map", "preview", "done"] as Step[]).map((s, i) => (
          <span
            key={s}
            className={`rounded px-2 py-1 uppercase ${
              step === s ? "bg-erp-action text-erp-action-fg" : "bg-surface text-muted-foreground"
            }`}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {step === "choose" && (
        <Panel title="1 · Select data type">
          <div className="grid gap-2 sm:grid-cols-2">
            {ENTITIES.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setEntity(e.id);
                  setStep("upload");
                }}
                className={`rounded-md border px-4 py-3 text-left text-sm ${
                  entity === e.id ? "border-brand bg-brand/5" : "border-border hover:bg-surface"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {step === "upload" && (
        <Panel title="2 · Upload file">
          <p className="mb-3 text-sm text-muted-foreground">
            Importing: <strong>{ENTITIES.find((e) => e.id === entity)?.label}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erp.secondaryBtn} onClick={() => downloadImportTemplate(entity)}>
              <Download className="mr-1 inline h-3.5 w-3.5" /> Sample template
            </button>
            <label className={`cursor-pointer ${erp.actionBtn}`}>
              <Upload className="mr-1 inline h-3.5 w-3.5" /> Choose file
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </label>
            <button type="button" className={erp.secondaryBtn} onClick={() => setStep("choose")}>
              Back
            </button>
          </div>
        </Panel>
      )}

      {(step === "map" || step === "preview") && preview && (
        <>
          <Panel title="3 · Field mapping">
            <div className="grid gap-3 sm:grid-cols-2">
              {targetFieldsFor(entity).map((field) => {
                const map = preview.mapping.find((m) => m.targetField === field);
                return (
                  <label key={field} className="block text-sm">
                    <ErpFieldLabel>{field}</ErpFieldLabel>
                    <select
                      className={`mt-1 ${erp.input}`}
                      value={map?.sourceColumn ?? ""}
                      onChange={(e) => updateMapping(field, e.target.value)}
                    >
                      <option value="">— skip —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className={erp.secondaryBtn} onClick={() => setStep("upload")}>
                Back
              </button>
              <button
                type="button"
                className={erp.actionBtn}
                onClick={() => {
                  setPreview(buildPreview(entity, preview.headers, preview.rows, preview.mapping));
                  setStep("preview");
                }}
              >
                Preview
              </button>
            </div>
          </Panel>

          {step === "preview" && (
            <Panel title="4 · Preview & validation" padded={false}>
              <div className="border-b border-border px-4 py-2 text-sm text-muted-foreground">
                {preview.rows.length} rows · {preview.duplicateCount} possible duplicate(s) ·{" "}
                {preview.issues.filter((i) => i.severity === "error").length} error(s)
              </div>
              {preview.issues.length > 0 && (
                <ul className="max-h-32 overflow-auto border-b border-border px-4 py-2 text-xs">
                  {preview.issues.map((issue, i) => (
                    <li key={i} className={issue.severity === "error" ? "text-danger" : "text-warning"}>
                      Row {issue.row}: {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface">
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h} className="px-2 py-1 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 25).map((row, ri) => (
                      <tr key={ri} className="border-t border-border">
                        {preview.headers.map((h) => (
                          <td key={h} className="px-2 py-1">
                            {String(row[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 border-t border-border p-4">
                <button type="button" className={erp.secondaryBtn} onClick={() => setStep("map")}>
                  Back
                </button>
                <button type="button" className={erp.actionBtn} onClick={runImport}>
                  Commit import
                </button>
              </div>
            </Panel>
          )}
        </>
      )}

      {step === "done" && (
        <Panel title="Import complete">
          <button type="button" className={erp.actionBtn} onClick={() => { setStep("choose"); setPreview(null); }}>
            Start another import
          </button>
        </Panel>
      )}

      <Panel title="Import history" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Entity</th>
              <th className="px-4 py-2 text-left">File</th>
              <th className="px-4 py-2 text-right">Rows</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  <History className="mx-auto mb-2 h-5 w-5 opacity-50" />
                  No imports yet.
                </td>
              </tr>
            )}
            {history.map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(h.at).toLocaleString()}
                </td>
                <td className="px-4 py-2">{h.entity}</td>
                <td className="px-4 py-2">{h.fileName}</td>
                <td className="px-4 py-2 text-right">
                  {h.successCount}/{h.rowCount}
                </td>
                <td className="px-4 py-2">{h.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
