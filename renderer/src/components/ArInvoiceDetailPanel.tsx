import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Panel, fmtMoney, erp } from "@/components/ui-bits";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { fetchArInvoiceDetailBridge } from "@/lib/ar-bridge";
import { exportBrandedPdf, formatOrgMoney } from "@/lib/document-pdf";
import { invoiceInputFromArDetail } from "@/lib/pdf-document-builders";
import { desktopSendEmail } from "@/lib/desktop-email";
import { invoiceEmailHtml } from "@/lib/email-templates";
import { FileDown, Mail } from "lucide-react";

type Props = {
  invoiceId: string;
  onClose: () => void;
};

export function ArInvoiceDetailPanel({ invoiceId, onClose }: Props) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [source, setSource] = useState("localStorage");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchArInvoiceDetailBridge(invoiceId).then(({ detail: d, source: s }) => {
      setDetail(d);
      setSource(s);
      setLoading(false);
    });
  }, [invoiceId]);

  if (loading) {
    return (
      <Panel title="Invoice detail">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Panel>
    );
  }

  if (!detail) {
    return (
      <Panel title="Invoice detail">
        <p className="text-sm text-muted-foreground">Invoice not found.</p>
        <button type="button" className={`mt-2 ${erp.secondaryBtn}`} onClick={onClose}>
          Close
        </button>
      </Panel>
    );
  }

  const journal = detail.journalEntry as Record<string, unknown> | null;
  const journalLines = (journal?.lines as { accountCode: string; debit: number; credit: number; description?: string }[]) ?? [];
  const allocations =
    (detail.allocations as {
      id: string;
      amount: number;
      payment?: { paidAt?: string; method?: string; amount?: number; journalEntryId?: string };
    }[]) ?? [];
  const creditMemos =
    (detail.creditMemos as { id: string; amount: number; reason: string; creditedAt?: string; journalEntryId?: string }[]) ?? [];
  const total = Number(detail.total);
  const amountPaid = Number(detail.amountPaid);
  const balance = Number(detail.balance);
  const journalId = journal?.id ? String(journal.id) : detail.journalEntryId ? String(detail.journalEntryId) : null;

  async function exportPdf() {
    try {
      await exportBrandedPdf(`invoice-${detail.invoiceNumber}.pdf`, invoiceInputFromArDetail(detail));
      toast.success("PDF downloaded.");
    } catch {
      toast.error("Could not generate PDF.");
    }
  }

  async function emailInvoice() {
    const to = window.prompt("Customer email address:");
    if (!to?.trim()) return;
    const input = invoiceInputFromArDetail(detail);
    const res = await desktopSendEmail({
      to: to.trim(),
      subject: `Invoice ${input.documentNumber} from ${input.partyName}`,
      html: invoiceEmailHtml({
        invoiceNumber: input.documentNumber,
        customerName: input.partyName,
        total: formatOrgMoney(input.total),
        balance: formatOrgMoney(input.balance ?? 0),
        dueDate: input.dueAt,
      }),
    });
    if (res.ok) toast.success("Invoice email sent.");
    else toast.error(res.error ?? "Email failed.");
  }

  return (
    <Panel
      title={`Invoice ${String(detail.invoiceNumber)}`}
      actions={
        <div className="flex items-center gap-2">
          <DataSourceBadge source={source} />
          <button type="button" className={erp.secondaryBtn} onClick={() => void exportPdf()}>
            <FileDown className="mr-1 inline h-3 w-3" />
            PDF
          </button>
          <button type="button" className={erp.secondaryBtn} onClick={() => void emailInvoice()}>
            <Mail className="mr-1 inline h-3 w-3" />
            Email
          </button>
          <button type="button" className={erp.secondaryBtn} onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Total</span>
          <div className={erp.financial}>{fmtMoney(total)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Paid</span>
          <div className={erp.financial}>{fmtMoney(amountPaid)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Balance</span>
          <div className={erp.financial}>{fmtMoney(balance)}</div>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-border bg-surface/50 p-3 text-sm">
        <div className="font-medium">Payment breakdown</div>
        <div className="mt-1 text-muted-foreground">
          {amountPaid <= 0
            ? "No payments applied yet."
            : `${fmtMoney(amountPaid)} applied across ${allocations.length} allocation(s). Remaining ${fmtMoney(balance)}.`}
        </div>
        {amountPaid > 0 && total > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-brand"
              style={{ width: `${Math.min(100, (amountPaid / total) * 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">GL impact (invoice)</h4>
          {journalId ? (
            <>
              <p className="text-xs text-muted-foreground">
                Journal ref: {String(journal?.reference ?? "—")} · {String(journal?.memo ?? "")}
              </p>
              <Link to="/accounting" className="text-xs text-brand hover:underline">
                View in General Ledger →
              </Link>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 text-left">Account</th>
                    <th className="py-1 text-right">Debit</th>
                    <th className="py-1 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {journalLines.map((ln, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1 font-mono">{ln.accountCode}</td>
                      <td className={`py-1 text-right ${erp.financial}`}>{fmtMoney(ln.debit)}</td>
                      <td className={`py-1 text-right ${erp.financial}`}>{fmtMoney(ln.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No journal linked (demo cache or pre-migration invoice).</p>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Payment allocations</h4>
          {allocations.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {allocations.map((a) => (
                <li key={a.id} className="flex justify-between border-b border-border py-1">
                  <span>
                    {a.payment?.paidAt ? String(a.payment.paidAt).slice(0, 10) : "—"} · {a.payment?.method ?? "—"}
                  </span>
                  <span className={erp.financial}>{fmtMoney(a.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Credit memos</h4>
          {creditMemos.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {creditMemos.map((c) => (
                <li key={c.id} className="flex justify-between border-b border-border py-1">
                  <span>{c.reason}</span>
                  <span className={erp.financial}>-{fmtMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}
