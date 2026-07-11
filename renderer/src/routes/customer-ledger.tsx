import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, fmtMoney, erp } from "@/components/ui-bits";
import { financeApiFetch } from "@/lib/finance-api-client";
import { isDesktopShell } from "@/lib/desktop-api";
import { desktopSendEmail } from "@/lib/desktop-email";
import { statementEmailHtml } from "@/lib/email-templates";
import { formatOrgMoney } from "@/lib/document-pdf";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/customer-ledger")({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : undefined,
  }),
  component: CustomerLedgerPage,
});

function CustomerLedgerPage() {
  const search = useSearch({ from: "/customer-ledger" });
  const [code, setCode] = useState(search.code ?? "C-1042");
  const [data, setData] = useState<{
    invoices: unknown[];
    payments: unknown[];
    credits: unknown[];
    balance: number;
  } | null>(null);

  useEffect(() => {
    if (!isDesktopShell() || !code) return;
    void financeApiFetch(`/api/finance/ar/ledger/${encodeURIComponent(code)}`).then(setData);
  }, [code]);

  return (
    <div className="space-y-6">
      <PageHeader title="Customer Ledger" subtitle="Invoices, payments, credits, and balance from local PostgreSQL." />
      <Panel title="Customer code">
        <input className={erp.input} value={code} onChange={(e) => setCode(e.target.value)} />
      </Panel>
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold">Balance: {fmtMoney(data.balance)}</p>
            <button
              type="button"
              className={erp.secondaryBtn}
              onClick={async () => {
                const to = window.prompt("Customer email for statement:");
                if (!to?.trim()) return;
                const invoices = data.invoices as unknown[];
                const res = await desktopSendEmail({
                  to: to.trim(),
                  subject: `Account statement — ${code}`,
                  html: statementEmailHtml({
                    customerName: code,
                    balance: formatOrgMoney(data.balance),
                    invoiceCount: invoices.length,
                  }),
                });
                if (res.ok) toast.success("Statement emailed.");
                else toast.error(res.error ?? "Email failed.");
              }}
            >
              <Mail className="mr-1 inline h-3 w-3" />
              Email statement
            </button>
          </div>
          <Panel title="Invoices" padded={false}>
            <table className="w-full text-sm">
              <tbody>
                {(data.invoices as { invoiceNumber: string; total: number; balance: number; status: string }[]).map(
                  (inv) => (
                    <tr key={inv.invoiceNumber} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2">{inv.status}</td>
                      <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(inv.balance)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
