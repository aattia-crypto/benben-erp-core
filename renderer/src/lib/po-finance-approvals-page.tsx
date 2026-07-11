import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, fmtMoney, erp } from "@/components/ui-bits";
import { PoLogPanel } from "@/components/PoLogPanel";
import {
  approvePO,
  denyPO,
  getPendingApprovalOrders,
  loadPoLogs,
  poGrandTotal,
  subscribePurchasing,
} from "@/lib/purchasing-store";
import { hasPermission } from "@/lib/permissions-store";

export function FinancePoApprovalsPage() {
  const [, tick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof loadPoLogs>>>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [denyTarget, setDenyTarget] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const canReview = hasPermission("modify_general_ledger");

  useEffect(() => subscribePurchasing(() => tick((n) => n + 1)), []);

  const pending = getPendingApprovalOrders();
  const selected = pending.find((o) => o.id === selectedId) ?? pending[0];

  useEffect(() => {
    if (!selected) {
      setLogs([]);
      setSelectedId(null);
      return;
    }
    setSelectedId(selected.id);
    setLogsLoading(true);
    void loadPoLogs(selected.id)
      .then(setLogs)
      .finally(() => setLogsLoading(false));
  }, [selected?.id]);

  function handleApprove(id: string) {
    approvePO(id);
    toast.success("Purchase order approved.");
  }

  function handleDeny() {
    if (!denyTarget) return;
    const reason = denyReason.trim();
    if (!reason) {
      toast.error("Enter a denial reason for the requester.");
      return;
    }
    denyPO(denyTarget, reason);
    setDenyTarget(null);
    setDenyReason("");
    toast.success("Purchase order denied — requester will see the reason in the PO log.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase order approvals"
        subtitle="Finance review queue. Approved POs return to Purchasing for receiving; denials are logged for the requester."
      />

      {!canReview ? (
        <Panel title="Read-only access">
          <p className="text-sm text-muted-foreground">
            You can view pending purchase orders. Approval and denial require Finance Manager privileges
            (modify general ledger).
          </p>
        </Panel>
      ) : null}

      <Panel padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">PO</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Requester</th>
              <th className="px-4 py-2 text-left">Delivery</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No purchase orders awaiting finance approval.
                </td>
              </tr>
            ) : (
              pending.map((o) => {
                const total = poGrandTotal(o);
                const active = selected?.id === o.id;
                return (
                  <tr
                    key={o.id}
                    className={`border-t border-border ${active ? "bg-brand/5" : ""}`}
                  >
                    <td className="px-4 py-2 font-mono text-xs">{o.poNumber}</td>
                    <td className="px-4 py-2">{o.vendorName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{o.requestedByName ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{o.expectedDelivery}</td>
                    <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(total)}</td>
                    <td className="space-x-2 px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-brand"
                        onClick={() => setSelectedId(o.id)}
                      >
                        Log
                      </button>
                      {canReview ? (
                        <>
                          <button
                            type="button"
                            className="text-xs text-brand"
                            onClick={() => handleApprove(o.id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="text-xs text-destructive"
                            onClick={() => {
                              setDenyTarget(o.id);
                              setDenyReason("");
                            }}
                          >
                            Deny
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Panel>

      {selected ? (
        <>
          <Panel title={`Line items — ${selected.poNumber}`} padded={false}>
            <table className="w-full text-sm">
              <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Unit cost</th>
                  <th className="px-4 py-2 text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line) => (
                  <tr key={line.sku} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs">{line.sku}</td>
                    <td className="px-4 py-2">{line.description}</td>
                    <td className="px-4 py-2 text-right">{line.qty}</td>
                    <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(line.unitCost)}</td>
                    <td className={`px-4 py-2 text-right ${erp.financial}`}>
                      {fmtMoney(line.qty * line.unitCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <PoLogPanel poNumber={selected.poNumber} logs={logs} loading={logsLoading} />
        </>
      ) : null}

      {denyTarget ? (
        <Panel title="Deny purchase order">
          <p className="mb-3 text-sm text-muted-foreground">
            Provide a reason — it will appear in the PO log for the requester.
          </p>
          <textarea
            className={`${erp.input} min-h-[80px] w-full`}
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            placeholder="e.g. Over budget for Q2 · vendor not on approved list"
          />
          <div className="mt-3 flex gap-2">
            <button type="button" className={erp.actionBtn} onClick={handleDeny}>
              Confirm denial
            </button>
            <button
              type="button"
              className={erp.secondaryBtn}
              onClick={() => {
                setDenyTarget(null);
                setDenyReason("");
              }}
            >
              Cancel
            </button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
