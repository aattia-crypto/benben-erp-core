import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FinanceModuleShell } from "@/components/FinanceModuleShell";
import { Panel, Pill, fmtMoney, erp, ErpFieldLabel } from "@/components/ui-bits";
import { financeApi } from "@/lib/finance-api-client";

export const Route = createFileRoute("/finance-bank")({
  head: () => ({ meta: [{ title: "Bank Reconciliation — Benben ERP" }] }),
  component: FinanceBankPage,
});

type BankTxn = {
  id: string;
  txnDate: string;
  amount: number;
  reference: string | null;
  matchStatus: string;
  matchedAmount: number;
  description: string | null;
};

function FinanceBankPage() {
  const [transactions, setTransactions] = useState<BankTxn[]>([]);
  const [statementId, setStatementId] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const refresh = useCallback(async () => {
    try {
      const q: Record<string, string> = {};
      if (filter !== "all") q.matchStatus = filter;
      const res = await financeApi.bankTransactions(q);
      setTransactions(res.transactions as BankTxn[]);
    } catch {
      setTransactions([]);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function uploadSample() {
    setBusy(true);
    try {
      const res = await financeApiFetchUpload();
      setStatementId(res.id);
      toast.success("Bank statement uploaded");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function autoMatch() {
    if (!statementId) {
      toast.error("Upload a statement first");
      return;
    }
    setBusy(true);
    try {
      const { financeApiFetch } = await import("@/lib/finance-api-client");
      await financeApiFetch("/api/finance/reconcile/match-auto", {
        method: "POST",
        body: JSON.stringify({ bankStatementId: statementId, dateToleranceDays: 3 }),
      });
      toast.success("Auto-match completed");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FinanceModuleShell
      title="Bank Reconciliation & Cash"
      subtitle="Live bank transactions from local PostgreSQL · match to GL cash entries."
    >
      <Panel title="Actions">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erp.btnPrimary} disabled={busy} onClick={() => void uploadSample()}>
            Upload sample statement
          </button>
          <button type="button" className={erp.btnSecondary} disabled={busy} onClick={() => void autoMatch()}>
            Run auto-match
          </button>
          <select className={erp.input} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="UNMATCHED">Unmatched</option>
            <option value="PARTIALLY_MATCHED">Partial</option>
            <option value="MATCHED">Matched</option>
            <option value="RECONCILED">Reconciled</option>
          </select>
        </div>
      </Panel>

      <Panel title="Bank transactions" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Reference</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No bank transactions in database yet.
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-2">{t.txnDate.slice(0, 10)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{t.reference ?? "—"}</td>
                  <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(t.amount)}</td>
                  <td className="px-4 py-2">
                    <Pill tone={t.matchStatus === "UNMATCHED" ? "warning" : "success"}>{t.matchStatus}</Pill>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>
    </FinanceModuleShell>
  );
}

async function financeApiFetchUpload(): Promise<{ id: string }> {
  const { financeApiFetch } = await import("@/lib/finance-api-client");
  return financeApiFetch("/api/finance/bank-statements/upload", {
    method: "POST",
    body: JSON.stringify({
      bankAccountCode: "1000",
      statementDate: new Date().toISOString().slice(0, 10),
      openingBalance: 10000,
      closingBalance: 10500,
      transactions: [
        {
          txnDate: new Date().toISOString().slice(0, 10),
          amount: 500,
          reference: "DEP-001",
          description: "Sample deposit",
        },
      ],
    }),
  });
}
