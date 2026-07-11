import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard, KpiGrid, fmtMoney, erp, ErpFieldLabel } from "@/components/ui-bits";
import { ApBillDetailPanel } from "@/components/ApBillDetailPanel";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { ExportMenu } from "@/components/ExportMenu";
import { createApVendorCreditBridge, payApBillBridge, scheduleApPaymentBridge } from "@/lib/ap-bridge";
import { useFinanceAp } from "@/hooks/use-finance-ap";

export const Route = createFileRoute("/ap")({
  head: () => ({
    meta: [{ title: "Accounts Payable — Benben ERP" }],
  }),
  component: ApPage,
});

function ApPage() {
  const { bills, dash, aging, recurring, source, loading, refresh } = useFinanceAp();
  const [selectedBill, setSelectedBill] = useState<string | null>(null);
  const [creditForm, setCreditForm] = useState({ billId: "", amount: 0, reason: "" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Payable"
        subtitle="Vendor bills, aging, payments, and vendor credits."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge source={source} />
            <ExportMenu
            filenameBase="ap-bills"
            columns={[
              { key: "billNumber", label: "Bill" },
              { key: "vendorName", label: "Vendor" },
              { key: "status", label: "Status" },
              { key: "balance", label: "Balance", align: "right", format: (v) => fmtMoney(Number(v)) },
              { key: "dueDate", label: "Due" },
            ]}
            rows={bills.map((b) => ({ ...b }))}
            meta={{ title: "AP Bills" }}
          />
          </div>
        }
      />

      {selectedBill && <ApBillDetailPanel billId={selectedBill} onClose={() => setSelectedBill(null)} />}

      {loading && <p className="text-sm text-muted-foreground">Loading AP…</p>}

      <KpiGrid columns={4}>
        <StatCard accent="financial" label="Open AP" value={fmtMoney(dash.openBalance)} />
        <StatCard accent="financial" label="Due this week" value={fmtMoney(dash.dueThisWeek)} />
        <StatCard accent="financial" label="Overdue" value={fmtMoney(dash.overdue)} />
        <StatCard accent="operational" label="Scheduled payments" value={String(dash.scheduledPayments)} />
      </KpiGrid>

      <Panel title="AP aging">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          {Object.entries(aging).map(([k, v]) => (
            <div key={k}>
              <div className="text-muted-foreground">{k}</div>
              <div className={erp.financial}>{fmtMoney(v)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Vendor bills" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Bill</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Balance</th>
              <th className="px-4 py-2 text-left">Due</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{b.billNumber}</td>
                <td className="px-4 py-2">
                  <Link
                    to="/vendor-ledger"
                    search={{ code: b.vendorCode }}
                    className="text-brand hover:underline"
                  >
                    {b.vendorName}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <Pill tone={b.status === "paid" ? "success" : "brand"}>{b.status}</Pill>
                </td>
                <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(b.balance)}</td>
                <td className="px-4 py-2 text-muted-foreground">{b.dueDate}</td>
                <td className="space-x-2 px-4 py-2 text-right">
                  <button type="button" className="text-xs text-brand" onClick={() => setSelectedBill(b.id)}>
                    Detail
                  </button>
                  {b.balance > 0 && (
                    <>
                      <button
                        type="button"
                        className="text-xs text-brand"
                        onClick={async () => {
                          await payApBillBridge(b.id, Math.min(5000, b.balance), "ach");
                          await refresh();
                          toast.success("Partial payment recorded.");
                        }}
                      >
                        Pay partial
                      </button>
                      <button
                        type="button"
                        className="text-xs text-brand"
                        onClick={async () => {
                          await scheduleApPaymentBridge(b.vendorCode, [b.id], b.balance, b.dueDate, "check");
                          toast.success("Payment scheduled.");
                        }}
                      >
                        Schedule
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Vendor credit">
        <div className="flex flex-wrap gap-2">
          <select
            className={erp.input}
            value={creditForm.billId}
            onChange={(e) => setCreditForm({ ...creditForm, billId: e.target.value })}
          >
            <option value="">Bill (optional)</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.billNumber}
              </option>
            ))}
          </select>
          <input
            type="number"
            className={`${erp.input} w-28`}
            placeholder="Amount"
            value={creditForm.amount || ""}
            onChange={(e) => setCreditForm({ ...creditForm, amount: Number(e.target.value) })}
          />
          <input
            className={`${erp.input} min-w-[12rem] flex-1`}
            placeholder="Reason"
            value={creditForm.reason}
            onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })}
          />
          <button
            type="button"
            className={erp.actionBtn}
            onClick={async () => {
              const bill = bills.find((x) => x.id === creditForm.billId);
              if (!creditForm.amount || !creditForm.reason) {
                toast.error("Amount and reason required.");
                return;
              }
              await createApVendorCreditBridge(
                bill?.vendorCode ?? "V-2210",
                creditForm.amount,
                creditForm.reason,
                creditForm.billId || undefined,
              );
              await refresh();
              toast.success("Vendor credit posted.");
              setCreditForm({ billId: "", amount: 0, reason: "" });
            }}
          >
            Post vendor credit
          </button>
        </div>
      </Panel>

      <Panel title="Recurring bills">
        <ul className="text-sm">
          {recurring.map((r) => (
            <li key={r.id} className="border-b border-border py-2">
              {r.vendorName} — {r.description}: {fmtMoney(r.amount)} / {r.cadence} · next {r.nextDue}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
