import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Panel, fmtMoney, erp } from "@/components/ui-bits";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { fetchApBillDetailBridge } from "@/lib/ap-bridge";
import { exportBrandedPdf } from "@/lib/document-pdf";
import { billInputFromApDetail } from "@/lib/pdf-document-builders";
import { FileDown } from "lucide-react";

type Props = {
  billId: string;
  onClose: () => void;
};

export function ApBillDetailPanel({ billId, onClose }: Props) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [source, setSource] = useState("localStorage");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchApBillDetailBridge(billId).then(({ detail: d, source: s }) => {
      setDetail(d);
      setSource(s);
      setLoading(false);
    });
  }, [billId]);

  if (loading) {
    return (
      <Panel title="Bill detail">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Panel>
    );
  }

  if (!detail) {
    return (
      <Panel title="Bill detail">
        <p className="text-sm text-muted-foreground">Bill not found.</p>
        <button type="button" className={`mt-2 ${erp.secondaryBtn}`} onClick={onClose}>
          Close
        </button>
      </Panel>
    );
  }

  const journal = detail.journalEntry as Record<string, unknown> | null;
  const journalLines = (journal?.lines as { accountCode: string; debit: number; credit: number }[]) ?? [];
  const allocations =
    (detail.allocations as {
      id: string;
      amount: number;
      payment?: { paidAt?: string; method?: string };
    }[]) ?? [];
  const credits =
    (detail.credits as { id: string; amount: number; reason: string }[]) ?? [];
  const total = Number(detail.total);
  const amountPaid = Number(detail.amountPaid);
  const balance = Number(detail.balance);

  async function exportPdf() {
    try {
      await exportBrandedPdf(`bill-${detail.billNumber}.pdf`, billInputFromApDetail(detail));
      toast.success("PDF downloaded.");
    } catch {
      toast.error("Could not generate PDF.");
    }
  }

  return (
    <Panel
      title={`Bill ${String(detail.billNumber)}`}
      actions={
        <div className="flex items-center gap-2">
          <DataSourceBadge source={source} />
          <button type="button" className={erp.secondaryBtn} onClick={() => void exportPdf()}>
            <FileDown className="mr-1 inline h-3 w-3" />
            PDF
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
        <p className="mt-1 text-muted-foreground">
          {amountPaid <= 0
            ? "No payments recorded."
            : `${fmtMoney(amountPaid)} paid · ${fmtMoney(balance)} remaining.`}
        </p>
      </div>

      <div className="space-y-4">
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">GL impact (bill)</h4>
          {journal ? (
            <>
              <Link to="/accounting" className="text-xs text-brand hover:underline">
                View in General Ledger →
              </Link>
              <table className="mt-2 w-full text-xs">
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
            <p className="text-xs text-muted-foreground">No journal linked.</p>
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
                  <span>{a.payment?.paidAt ? String(a.payment.paidAt).slice(0, 10) : "—"}</span>
                  <span className={erp.financial}>{fmtMoney(a.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Vendor credits</h4>
          {credits.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {credits.map((c) => (
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
