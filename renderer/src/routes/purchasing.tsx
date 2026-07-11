import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, fmtMoney, erp } from "@/components/ui-bits";
import { ExportToolbar } from "@/components/ExportToolbar";
import { PoLogPanel } from "@/components/PoLogPanel";
import {
  getPurchaseOrders,
  loadPoLogs,
  poGrandTotal,
  receivePO,
  submitPOForApproval,
  subscribePurchasing,
} from "@/lib/purchasing-store";
import { PurchaseOrderCreateDialog } from "@/components/PurchaseOrderCreateDialog";
import { adjustStock } from "@/lib/inventory-store";
import { desktopPickFile, isDesktopShell } from "@/lib/desktop-api";
import { FileSpreadsheet, Plus } from "lucide-react";

export const Route = createFileRoute("/purchasing")({
  head: () => ({
    meta: [
      { title: "Purchasing — Benben ERP" },
      { name: "description", content: "Purchase orders, vendor tracking, receiving, and approvals." },
    ],
  }),
  component: PurchasingPage,
});

function statusTone(status: string): "success" | "neutral" | "brand" | "warning" {
  if (status === "approved" || status === "received") return "success";
  if (status === "draft" || status === "closed") return "neutral";
  if (status === "denied") return "warning";
  return "brand";
}

function PurchasingPage() {
  const [, tick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showPo, setShowPo] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof loadPoLogs>>>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => subscribePurchasing(() => tick((n) => n + 1)), []);

  const orders = getPurchaseOrders();
  const selected = orders.find((o) => o.id === selectedId);

  useEffect(() => {
    if (!selectedId) {
      setLogs([]);
      return;
    }
    setLogsLoading(true);
    void loadPoLogs(selectedId)
      .then(setLogs)
      .finally(() => setLogsLoading(false));
  }, [selectedId, orders.length]);

  async function browseInvoice() {
    if (isDesktopShell()) {
      const path = await desktopPickFile([{ name: "Invoices", extensions: ["pdf", "csv", "xlsx"] }]);
      if (path) toast.success(`Selected: ${path}`);
      return;
    }
    fileRef.current?.click();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchasing"
        subtitle="Raise POs for finance approval, track status in the PO log, and receive goods after approval."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportToolbar
              filenameBase="purchase-orders"
              columns={[
                { key: "poNumber", label: "PO #" },
                { key: "vendorName", label: "Vendor" },
                { key: "status", label: "Status" },
                { key: "total", label: "Total", align: "right", format: (v) => fmtMoney(Number(v)) },
              ]}
              rows={orders.map((o) => ({
                poNumber: o.poNumber,
                vendorName: o.vendorName,
                status: o.status,
                total: o.lines.reduce((s, l) => s + l.qty * l.unitCost, 0),
              }))}
              meta={{ title: "Purchase Orders" }}
            />
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.csv,.xlsx" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) toast.success(`Attached ${f.name}`);
            }} />
            <button type="button" className={erp.secondaryBtn} onClick={browseInvoice}>
              <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" /> Browse Files
            </button>
            <button type="button" className={erp.actionBtn} onClick={() => setShowPo(true)}>
              <Plus className="mr-1 inline h-3.5 w-3.5" /> New PO
            </button>
          </div>
        }
      />

      <Panel padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">PO</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No purchase orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const total = poGrandTotal(o);
                return (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs">{o.poNumber}</td>
                    <td className="px-4 py-2">{o.vendorName}</td>
                    <td className="px-4 py-2">
                      <Pill tone={statusTone(o.status)}>{o.status.replace(/_/g, " ")}</Pill>
                    </td>
                    <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(total)}</td>
                    <td className="space-x-2 px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-brand"
                        onClick={() => setSelectedId(selectedId === o.id ? null : o.id)}
                      >
                        {selectedId === o.id ? "Hide log" : "PO log"}
                      </button>
                      {o.status === "draft" && (
                        <button
                          type="button"
                          className="text-xs text-brand"
                          onClick={() => {
                            submitPOForApproval(o.id);
                            toast.success("Submitted to finance for approval.");
                          }}
                        >
                          Submit for approval
                        </button>
                      )}
                      {o.status === "pending_approval" && (
                        <span className="text-xs text-muted-foreground">Awaiting finance</span>
                      )}
                      {o.status === "approved" && o.lines[0] && (
                        <button
                          type="button"
                          className="text-xs text-brand"
                          onClick={() => {
                            const line = o.lines[0];
                            receivePO(o.id, line.sku, line.qty);
                            adjustStock(line.sku, line.qty, "receive", `PO ${o.poNumber}`);
                            void import("@/lib/erp-integrations").then(({ integratePoToApBill }) =>
                              integratePoToApBill(o),
                            );
                            toast.success("Received into inventory and AP bill created.");
                          }}
                        >
                          Receive
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Panel>

      {selected ? (
        <PoLogPanel
          poNumber={selected.poNumber}
          logs={logs}
          loading={logsLoading}
          denialReason={selected.denialReason}
        />
      ) : null}

      <PurchaseOrderCreateDialog
        open={showPo}
        onOpenChange={setShowPo}
        onSaved={() => toast.success("Purchase order saved.")}
      />
    </div>
  );
}
