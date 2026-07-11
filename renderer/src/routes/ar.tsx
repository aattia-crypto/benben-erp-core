import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard, KpiGrid, fmtMoney, erp, ErpFieldLabel } from "@/components/ui-bits";
import { ArInvoiceDetailPanel } from "@/components/ArInvoiceDetailPanel";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { ExportMenu } from "@/components/ExportMenu";
import { applyArPaymentBridge, createArCreditMemoBridge } from "@/lib/ar-bridge";
import { addCollectionNote, getCollectionNotes } from "@/lib/ar-store";
import { useFinanceAr } from "@/hooks/use-finance-ar";

export const Route = createFileRoute("/ar")({
  head: () => ({
    meta: [{ title: "Accounts Receivable — Benben ERP" }],
  }),
  component: ArPage,
});

function ArPage() {
  const { invoices, dash, aging, source, loading, refresh } = useFinanceAr();
  const [payForm, setPayForm] = useState({ invoiceId: "", amount: 0 });
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [creditForm, setCreditForm] = useState({ invoiceId: "", amount: 0, reason: "" });
  const [noteCustomerCode, setNoteCustomerCode] = useState("");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Receivable"
        subtitle="Customer invoices, aging, payments, and credit memos."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge source={source} />
            <ExportMenu
            filenameBase="ar-invoices"
            columns={[
              { key: "invoiceNumber", label: "Invoice" },
              { key: "customerName", label: "Customer" },
              { key: "status", label: "Status" },
              { key: "balance", label: "Balance", align: "right", format: (v) => fmtMoney(Number(v)) },
              { key: "dueAt", label: "Due" },
            ]}
            rows={invoices.map((i) => ({ ...i }))}
            meta={{ title: "AR Invoices" }}
          />
          </div>
        }
      />

      {selectedInvoice && (
        <ArInvoiceDetailPanel invoiceId={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading AR…</p>}

      <KpiGrid columns={4}>
        <StatCard accent="financial" label="Open AR" value={fmtMoney(dash.openBalance)} hint={`${dash.openCount} invoices`} />
        <StatCard accent="financial" label="Overdue" value={fmtMoney(dash.overdueBalance)} hint="collections" />
        <StatCard accent="financial" label="Unapplied cash" value={fmtMoney(dash.unappliedPayments)} />
        <StatCard accent="operational" label="Open invoices" value={String(dash.openCount)} />
      </KpiGrid>

      <Panel title="Aging buckets">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          {(
            [
              ["current", "Current"],
              ["d30", "1–30"],
              ["d60", "31–60"],
              ["d90", "61–90"],
              ["d90plus", "90+"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <div className="text-muted-foreground">{label}</div>
              <div className={erp.financial}>{fmtMoney(aging[k] ?? 0)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Invoices" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Invoice</th>
              <th className="px-4 py-2 text-left">Customer</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Balance</th>
              <th className="px-4 py-2 text-left">Due</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="px-4 py-2">
                  <Link
                    to="/customer-ledger"
                    search={{ code: inv.customerCode }}
                    className="text-brand hover:underline"
                  >
                    {inv.customerName}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <Pill tone={inv.status === "paid" ? "success" : "brand"}>{inv.status}</Pill>
                </td>
                <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(inv.balance)}</td>
                <td className="px-4 py-2 text-muted-foreground">{inv.dueAt}</td>
                <td className="space-x-2 px-4 py-2 text-right">
                  <button
                    type="button"
                    className="text-xs text-brand"
                    onClick={() => setSelectedInvoice(inv.id)}
                  >
                    Detail
                  </button>
                  {inv.balance > 0 && (
                    <button
                      type="button"
                      className="text-xs text-brand"
                      onClick={async () => {
                        await applyArPaymentBridge(
                          inv.customerCode,
                          inv.balance,
                          [{ invoiceId: inv.id, amount: inv.balance }],
                          "ach",
                        );
                        await refresh();
                        toast.success("Payment applied.");
                      }}
                    >
                      Apply payment
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      setCreditForm({
                        invoiceId: inv.id,
                        amount: Math.min(100, inv.balance),
                        reason: "Goodwill credit",
                      });
                    }}
                  >
                    Credit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Credit memo">
        <div className="flex flex-wrap gap-2">
          <select
            className={erp.input}
            value={creditForm.invoiceId}
            onChange={(e) => setCreditForm({ ...creditForm, invoiceId: e.target.value })}
          >
            <option value="">Invoice (optional)</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNumber}
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
              const inv = invoices.find((i) => i.id === creditForm.invoiceId);
              if (!inv) {
                toast.error("Select an invoice.");
                return;
              }
              if (!creditForm.amount || !creditForm.reason) {
                toast.error("Amount and reason required.");
                return;
              }
              await createArCreditMemoBridge(
                inv.customerCode,
                creditForm.amount,
                creditForm.reason,
                creditForm.invoiceId || undefined,
              );
              await refresh();
              toast.success("Credit memo posted to GL.");
              setCreditForm({ invoiceId: "", amount: 0, reason: "" });
            }}
          >
            Post credit memo
          </button>
        </div>
      </Panel>

      <Panel title="Apply payment">
        <div className="flex flex-wrap gap-2">
          <select
            className={erp.input}
            value={payForm.invoiceId}
            onChange={(e) => setPayForm({ ...payForm, invoiceId: e.target.value })}
          >
            <option value="">Select invoice</option>
            {invoices
              .filter((i) => i.balance > 0)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoiceNumber} — {fmtMoney(i.balance)}
                </option>
              ))}
          </select>
          <input
            type="number"
            className={`${erp.input} w-32`}
            value={payForm.amount}
            onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
          />
          <button
            type="button"
            className={erp.actionBtn}
            onClick={async () => {
              const inv = invoices.find((i) => i.id === payForm.invoiceId);
              if (!inv || payForm.amount <= 0) {
                toast.error("Select invoice and amount.");
                return;
              }
              await applyArPaymentBridge(
                inv.customerCode,
                payForm.amount,
                [{ invoiceId: inv.id, amount: payForm.amount }],
                "check",
              );
              await refresh();
              toast.success("Payment recorded.");
            }}
          >
            Record payment
          </button>
        </div>
      </Panel>

      <Panel title="Collections notes">
        <div className="mb-2 flex flex-wrap gap-2">
          <select
            className={erp.input}
            value={noteCustomerCode}
            onChange={(e) => setNoteCustomerCode(e.target.value)}
          >
            <option value="">Select customer…</option>
            {[...new Set(invoices.map((i) => i.customerCode))].map((code) => {
              const inv = invoices.find((i) => i.customerCode === code);
              return (
                <option key={code} value={code}>
                  {inv?.customerName ?? code}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className={erp.secondaryBtn}
            onClick={() => {
              if (!noteCustomerCode) {
                toast.error("Select a customer from open invoices.");
                return;
              }
              addCollectionNote(noteCustomerCode, "Follow-up call scheduled");
              toast.success("Note added.");
            }}
          >
            + Add note
          </button>
        </div>
        <ul className="text-xs text-muted-foreground">
          {getCollectionNotes().map((n) => (
            <li key={n.id}>
              {n.customerCode}: {n.note} · {new Date(n.at).toLocaleString()}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
