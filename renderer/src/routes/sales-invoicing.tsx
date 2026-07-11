import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, fmtMoney, erp } from "@/components/ui-bits";
import { ExportMenu } from "@/components/ExportMenu";
import { SalesQuoteCreateDialog } from "@/components/SalesQuoteCreateDialog";
import {
  convertOrderToInvoice,
  convertQuoteToOrder,
  getQuotes,
  getSalesInvoices,
  getSalesOrders,
  subscribeSales,
} from "@/lib/sales-store";
import { integrateSalesInvoiceFulfillment } from "@/lib/erp-integrations";
import { exportPdf, type ExportColumn } from "@/lib/export-service";
import { getCompanySettings } from "@/lib/company-settings";
import { useCompanyName } from "@/hooks/use-workspace";
import { subscribeErp } from "@/lib/erp-sync";

export const Route = createFileRoute("/sales-invoicing")({
  head: () => ({
    meta: [{ title: "Sales Invoicing — Benben ERP" }],
  }),
  component: SalesInvoicingPage,
});

function SalesInvoicingPage() {
  const companyName = useCompanyName();
  const [, tick] = useState(0);
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    const unsubs = [subscribeSales(() => tick((n) => n + 1)), subscribeErp(() => tick((n) => n + 1))];
    return () => unsubs.forEach((u) => u());
  }, []);

  const quotes = getQuotes();
  const orders = getSalesOrders();
  const invoices = getSalesInvoices();
  const settings = getCompanySettings();

  const invColumns: ExportColumn[] = [
    { key: "invoiceNumber", label: "Invoice" },
    { key: "customerName", label: "Customer" },
    { key: "total", label: "Total", align: "right", format: (v) => fmtMoney(Number(v)) },
    { key: "dueAt", label: "Due" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Invoicing"
        subtitle="Quote → sales order → invoice with taxes, terms, and integrated AR/GL/inventory."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand/90"
              onClick={() => setQuoteOpen(true)}
            >
              New quote
            </button>
            <ExportMenu filenameBase="sales-invoices" columns={invColumns} rows={invoices.map((i) => ({ ...i }))} />
          </div>
        }
      />

      <Panel title="Workflow · Quotes">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="py-1 text-left">Quote</th>
              <th className="py-1 text-left">Customer</th>
              <th className="py-1 text-right">Total</th>
              <th className="py-1 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-border">
                <td className="py-2 font-mono text-xs">{q.quoteNumber}</td>
                <td className="py-2">{q.customerName}</td>
                <td className={`py-2 text-right ${erp.financial}`}>{fmtMoney(q.total)}</td>
                <td className="py-2 text-right">
                  {q.status === "open" && (
                    <button
                      type="button"
                      className="text-xs text-brand"
                      onClick={() => {
                        const o = convertQuoteToOrder(q.id);
                        if (o) toast.success(`Sales order ${o.orderNumber} created.`);
                      }}
                    >
                      → Sales order
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Sales orders">
        <table className="w-full text-sm">
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="py-2 font-mono text-xs">{o.orderNumber}</td>
                <td className="py-2">{o.customerName}</td>
                <td className={`py-2 text-right ${erp.financial}`}>{fmtMoney(o.total)}</td>
                <td className="py-2 text-right">
                  {o.status === "open" && (
                    <button
                      type="button"
                      className="text-xs text-brand"
                      onClick={() => {
                        const inv = convertOrderToInvoice(o.id);
                        if (inv) toast.success(`Invoice ${inv.invoiceNumber} created.`);
                      }}
                    >
                      → Invoice
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-muted-foreground">
                  Convert a quote to create a sales order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <Panel title="Invoices · fulfill & post">
        <table className="w-full text-sm">
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-border">
                <td className="py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="py-2">{inv.customerName}</td>
                <td className="py-2">
                  <Pill tone="brand">{inv.status}</Pill>
                </td>
                <td className={`py-2 text-right ${erp.financial}`}>{fmtMoney(inv.total)}</td>
                <td className="py-2 text-right space-x-2">
                  <button
                    type="button"
                    className="text-xs text-brand"
                    onClick={() => {
                      try {
                        void integrateSalesInvoiceFulfillment(inv);
                        toast.success("Posted to AR, GL, inventory, and CRM.");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Post failed");
                      }
                    }}
                  >
                    Fulfill & post
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      exportPdf(
                        `${inv.invoiceNumber}.pdf`,
                        invColumns,
                        [{ ...inv }],
                        { title: `${companyName} Invoice`, subtitle: settings.invoiceFooter },
                      );
                      toast.success("PDF generated (branded template).");
                    }}
                  >
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <SalesQuoteCreateDialog open={quoteOpen} onOpenChange={setQuoteOpen} onSaved={() => tick((n) => n + 1)} />
    </div>
  );
}
