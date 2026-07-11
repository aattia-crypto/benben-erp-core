/**
 * Branded PDF documents for invoices, statements, bills, and reports.
 */

import { getCompanyBranding, getOrgProfile } from "./org-profile";
import { getCompanyName } from "./workspace-store";
import { formatMoneyLocale, sanitizeUnicodeText } from "./locale-format";

export function formatOrgMoney(n: number): string {
  return formatMoneyLocale(n, getOrgProfile().baseCurrency || "USD");
}

export type DocumentLine = {
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
};

export type InvoiceDocumentInput = {
  documentType: "invoice" | "statement" | "receipt" | "purchase_order" | "bill";
  documentNumber: string;
  partyName: string;
  partyCode?: string;
  issuedAt: string;
  dueAt?: string;
  lines: DocumentLine[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid?: number;
  balance?: number;
  memo?: string;
};

export type ReportPdfInput = {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
};

function brandingHeader(doc: import("jspdf").jsPDF, startY: number): number {
  const b = getCompanyBranding();
  const name = b.legalName || getCompanyName();
  let y = startY;
  let textX = 14;

  if (b.logoDataUrl?.startsWith("data:image")) {
    try {
      const fmt = b.logoDataUrl.includes("png") ? "PNG" : "JPEG";
      doc.addImage(b.logoDataUrl, fmt, 14, y, 28, 14);
      textX = 46;
    } catch {
      /* logo optional */
    }
  }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(sanitizeUnicodeText(name), textX, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let lineY = y + 11;
  const addr = [b.addressLine1, b.addressLine2, `${b.city} ${b.state} ${b.postalCode}`.trim(), b.country]
    .filter(Boolean)
    .join(" · ");
  if (addr) {
    doc.text(addr, textX, lineY);
    lineY += 4;
  }
  if (b.phone || b.email) {
    doc.text([b.phone, b.email].filter(Boolean).join(" · "), textX, lineY);
    lineY += 4;
  }
  if (b.taxId) {
    doc.text(`Tax ID: ${b.taxId}`, textX, lineY);
    lineY += 4;
  }
  return Math.max(lineY + 4, y + 20);
}

const DOC_TITLES: Record<InvoiceDocumentInput["documentType"], string> = {
  invoice: "INVOICE",
  statement: "STATEMENT",
  receipt: "RECEIPT",
  purchase_order: "PURCHASE ORDER",
  bill: "VENDOR BILL",
};

export async function exportBrandedPdf(filename: string, input: InvoiceDocumentInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const profile = getOrgProfile();
  let y = brandingHeader(doc, 14);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(DOC_TITLES[input.documentType], 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`No. ${input.documentNumber}`, 14, y);
  y += 4;
  doc.text(`Date: ${input.issuedAt}`, 14, y);
  y += 4;
  if (input.dueAt) {
    doc.text(`Due: ${input.dueAt}`, 14, y);
    y += 4;
  }
  const partyLabel = input.documentType === "bill" ? "Vendor" : "Bill to";
  doc.text(`${partyLabel}: ${input.partyName}${input.partyCode ? ` (${input.partyCode})` : ""}`, 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Description", "Qty", "Unit", "Amount"]],
    body: input.lines.map((l) => [
      l.description,
      String(l.qty),
      formatOrgMoney(l.unitPrice),
      formatOrgMoney(l.amount),
    ]),
    styles: { fontSize: 8, overflow: "linebreak", cellWidth: "wrap" },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
    pageBreak: "auto",
    rowPageBreak: "avoid",
  });

  const finalY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  let ty = finalY + 8;
  const pageH = doc.internal.pageSize.getHeight();
  if (ty > pageH - 30) {
    doc.addPage();
    ty = 20;
  }

  doc.setFontSize(9);
  doc.text(`Subtotal: ${formatOrgMoney(input.subtotal)}`, 196, ty, { align: "right" });
  ty += 5;
  doc.text(`Tax: ${formatOrgMoney(input.tax)}`, 196, ty, { align: "right" });
  ty += 5;
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${formatOrgMoney(input.total)}`, 196, ty, { align: "right" });
  if (input.balance != null) {
    ty += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`Balance due: ${formatOrgMoney(input.balance)}`, 196, ty, { align: "right" });
  }
  ty += 10;
  doc.setFontSize(8);
  doc.text(getCompanyBranding().footerText, 14, ty);
  doc.text(`Currency: ${profile.baseCurrency}`, 14, ty + 4);

  doc.save(filename);
}

export async function exportReportPdf(filename: string, input: ReportPdfInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: input.columns.length > 5 ? "landscape" : "portrait" });
  let y = brandingHeader(doc, 14);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(input.title, 14, y);
  y += 6;
  if (input.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(input.subtitle, 14, y);
    y += 5;
  }

  autoTable(doc, {
    startY: y,
    head: [input.columns],
    body: input.rows.map((r) => r.map(String)),
    styles: { fontSize: 7, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
    pageBreak: "auto",
  });

  const profile = getOrgProfile();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `${getCompanyBranding().footerText} · ${profile.baseCurrency} · Page ${i} of ${pages}`,
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  doc.save(filename);
}
