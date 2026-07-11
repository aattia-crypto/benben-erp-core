import type { DocumentLine, InvoiceDocumentInput } from "./document-pdf";

export function linesFromDetail(detail: Record<string, unknown>, fallbackTotal: number): DocumentLine[] {
  const rawLines =
    (detail.lines as { description?: string; qty?: number; unitPrice?: number; amount?: number }[]) ??
    (() => {
      try {
        return JSON.parse(String(detail.linesJson ?? "[]")) as DocumentLine[];
      } catch {
        return [];
      }
    })();

  const lines: DocumentLine[] = rawLines.map((ln) => ({
    description: String(ln.description ?? "Line"),
    qty: Number(ln.qty ?? 1),
    unitPrice: Number(ln.unitPrice ?? ln.amount ?? 0),
    amount: Number(ln.amount ?? ln.unitPrice ?? 0),
  }));

  if (!lines.length) {
    return [{ description: "Total", qty: 1, unitPrice: fallbackTotal, amount: fallbackTotal }];
  }
  return lines;
}

export function invoiceInputFromArDetail(detail: Record<string, unknown>): InvoiceDocumentInput {
  const total = Number(detail.total);
  const lines = linesFromDetail(detail, total);
  const subtotal = lines.reduce((s, l) => s + l.amount, 0) || total;
  return {
    documentType: "invoice",
    documentNumber: String(detail.invoiceNumber),
    partyName: String(detail.customerName ?? "Customer"),
    partyCode: detail.customerCode ? String(detail.customerCode) : undefined,
    issuedAt: String(detail.issuedAt ?? detail.createdAt ?? new Date().toISOString()).slice(0, 10),
    dueAt: detail.dueAt ? String(detail.dueAt).slice(0, 10) : undefined,
    lines,
    subtotal,
    tax: Number(detail.tax ?? 0),
    total,
    amountPaid: Number(detail.amountPaid ?? 0),
    balance: Number(detail.balance ?? 0),
  };
}

export function billInputFromApDetail(detail: Record<string, unknown>): InvoiceDocumentInput {
  const total = Number(detail.total);
  const lines = linesFromDetail(detail, total);
  const subtotal = lines.reduce((s, l) => s + l.amount, 0) || total;
  return {
    documentType: "bill",
    documentNumber: String(detail.billNumber),
    partyName: String(detail.vendorName ?? "Vendor"),
    partyCode: detail.vendorCode ? String(detail.vendorCode) : undefined,
    issuedAt: String(detail.issuedAt ?? detail.billDate ?? new Date().toISOString()).slice(0, 10),
    dueAt: detail.dueDate ? String(detail.dueDate).slice(0, 10) : undefined,
    lines,
    subtotal,
    tax: Number(detail.tax ?? 0),
    total,
    amountPaid: Number(detail.amountPaid ?? 0),
    balance: Number(detail.balance ?? 0),
  };
}
