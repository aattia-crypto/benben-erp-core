import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard, KpiGrid, fmtMoney, erp, ErpFieldLabel } from "@/components/ui-bits";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { ExportToolbar } from "@/components/ExportToolbar";
import { extractInvoiceFromText, getAudit, type DraftJournalLine } from "@/lib/gl-store";
import { postJournalBridge, reverseJournalBridge } from "@/lib/gl-bridge";
import { useFinanceGl } from "@/hooks/use-finance-gl";
import { useCompanyName } from "@/hooks/use-workspace";
import { Lock, Plus } from "lucide-react";

export const Route = createFileRoute("/accounting")({
  head: () => ({
    meta: [
      { title: "Financial Ledger — Benben ERP" },
      { name: "description", content: "General ledger, journal entries, trial balance, and invoice processing." },
    ],
  }),
  component: Accounting,
});

const groups: Record<string, string> = {
  asset: "Assets (1000s)",
  liability: "Liabilities (2000s)",
  equity: "Equity (3000s)",
  revenue: "Revenue (4000s)",
  expense: "Expenses (5000s)",
};

function Accounting() {
  const companyName = useCompanyName();
  const { accounts, journal, trialRows, source, loading, refresh } = useFinanceGl();
  const [tab, setTab] = useState<"ledger" | "journal" | "trial" | "invoice">("ledger");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftJournalLine[]>([
    { account: "1000", debit: 0, credit: 0 },
    { account: "4000", debit: 0, credit: 0 },
  ]);
  const [invoiceText, setInvoiceText] = useState("");

  const totalAssets = accounts.filter((a) => a.type === "asset").reduce((s, a) => s + a.balance, 0);
  const revenue = accounts.filter((a) => a.type === "revenue").reduce((s, a) => s + a.balance, 0);
  const expense = accounts.filter((a) => a.type === "expense").reduce((s, a) => s + a.balance, 0);

  async function postEntry() {
    try {
      const { source: postedSource } = await postJournalBridge(memo, lines, "manual", {
        module: "gl",
        idempotencyKey: `gl-manual-${Date.now()}`,
      });
      toast.success(`Journal posted (${postedSource}).`);
      setMemo("");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Post failed.");
    }
  }

  const extracted = invoiceText ? extractInvoiceFromText(invoiceText) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Ledger"
        subtitle={`${companyName} · Journal posting, reversals, trial balance${loading ? " (loading)" : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge source={source} />
            <Link to="/finance-rev-rec" className={erp.secondaryBtn}>
              Rev Rec &amp; WIP
            </Link>
            <ExportToolbar
            filenameBase="journal"
            columns={[
              { key: "ref", label: "Ref" },
              { key: "date", label: "Date" },
              { key: "memo", label: "Memo" },
              { key: "source", label: "Source" },
            ]}
            rows={journal.map((j) => ({ ref: j.ref, date: j.date, memo: j.memo, source: j.source }))}
            meta={{ title: "Journal Entries" }}
          />
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(["ledger", "journal", "trial", "invoice"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
              tab === t ? "bg-erp-action text-erp-action-fg" : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {t === "invoice" ? "Invoice scan" : t}
          </button>
        ))}
      </div>

      <KpiGrid columns={4}>
        <StatCard label="Total Assets" value={fmtMoney(totalAssets)} />
        <StatCard label="Net Income (YTD)" value={fmtMoney(revenue - expense)} />
        <StatCard label="Journal entries" value={String(journal.length)} />
        <StatCard label="Audit events" value={String(getAudit().length)} />
      </KpiGrid>

      {tab === "journal" && (
        <Panel title="New journal entry">
          <label className="block">
            <ErpFieldLabel>Memo</ErpFieldLabel>
            <input className={`mt-1 ${erp.input}`} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <div className="mt-3 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-4 gap-2">
                <select
                  className={erp.input}
                  value={l.account}
                  onChange={(e) => {
                    const next = [...lines];
                    next[i] = { ...next[i], account: e.target.value };
                    setLines(next);
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className={erp.input}
                  placeholder="Debit"
                  value={l.debit || ""}
                  onChange={(e) => {
                    const next = [...lines];
                    next[i] = { account: l.account, debit: Number(e.target.value), credit: 0 };
                    setLines(next);
                  }}
                />
                <input
                  type="number"
                  className={erp.input}
                  placeholder="Credit"
                  value={l.credit || ""}
                  onChange={(e) => {
                    const next = [...lines];
                    next[i] = { account: l.account, debit: 0, credit: Number(e.target.value) };
                    setLines(next);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className={erp.secondaryBtn} onClick={() => setLines([...lines, { account: "1000", debit: 0, credit: 0 }])}>
              <Plus className="mr-1 inline h-3 w-3" /> Line
            </button>
            <button type="button" className={erp.actionBtn} onClick={postEntry}>
              Post entry
            </button>
          </div>
        </Panel>
      )}

      {tab === "trial" && (
        <Panel padded={false} title="Trial balance">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Account</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {trialRows.map((r) => (
                <tr key={r.code} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">
                    {r.code} {r.name}
                  </td>
                  <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(r.debit)}</td>
                  <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(r.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === "invoice" && (
        <Panel title="Scanned invoice processing">
          <p className="text-xs text-muted-foreground">
            Upload a PDF in desktop mode or paste invoice text below. Fields populate the journal form (OCR-ready hook).
          </p>
          <textarea
            className={`mt-2 min-h-[120px] ${erp.input}`}
            placeholder="Paste invoice text…"
            value={invoiceText}
            onChange={(e) => setInvoiceText(e.target.value)}
          />
          {extracted && (
            <div className="mt-3 rounded-md border border-border bg-erp-readonly p-3 text-sm">
              <div>Vendor: {extracted.vendor ?? "—"}</div>
              <div>Invoice #: {extracted.invoiceNumber ?? "—"}</div>
              <div className={erp.financial}>Total: {extracted.total ? fmtMoney(extracted.total) : "—"}</div>
              <button
                type="button"
                className={`mt-2 ${erp.actionBtn}`}
                onClick={() => {
                  if (!extracted.total) return toast.error("No total detected.");
                  setMemo(`Invoice ${extracted.invoiceNumber ?? ""} · ${extracted.vendor ?? ""}`);
                  setLines([
                    { account: "5000", debit: extracted.total, credit: 0 },
                    { account: "2000", debit: 0, credit: extracted.total },
                  ]);
                  setTab("journal");
                  toast.success("Form populated from invoice.");
                }}
              >
                Apply to journal
              </button>
            </div>
          )}
        </Panel>
      )}

      {tab === "ledger" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Chart of Accounts" padded={false}>
            {Object.entries(groups).map(([type, label]) => {
              const rows = accounts.filter((a) => a.type === type);
              return (
                <div key={type} className="border-b border-border">
                  <div className="bg-surface px-4 py-2 text-[11px] uppercase text-muted-foreground">{label}</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.code} className="border-t border-border">
                          <td className="px-4 py-2 font-mono text-xs">{a.code}</td>
                          <td className="px-4 py-2">{a.name}</td>
                          <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(a.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </Panel>

          <Panel
            title="Journal entries"
            actions={
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" /> Posted entries are immutable — use reversal
              </span>
            }
            padded={false}
          >
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {journal.map((j) => (
                <article key={j.id} className="px-4 py-3">
                  <header className="flex justify-between">
                    <span className="font-mono text-xs">{j.ref}</span>
                    <Pill tone="brand">{j.source}</Pill>
                  </header>
                  <p className="mt-1 text-sm">{j.memo}</p>
                  <button
                    type="button"
                    className="mt-2 text-xs text-brand"
                    onClick={() => {
                      void (async () => {
                        try {
                          await reverseJournalBridge(j.id);
                          toast.success("Reversal posted.");
                          void refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Reversal failed.");
                        }
                      })();
                    }}
                  >
                    Reverse entry
                  </button>
                </article>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
