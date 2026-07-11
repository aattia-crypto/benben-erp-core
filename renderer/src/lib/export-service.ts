/** Print and export utilities for ERP tables and reports. */

import { openPrintPreview } from "./print-preview-store";

export type ExportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: (value: unknown, row: Record<string, unknown>) => string;
};

export type ExportMeta = {
  title: string;
  subtitle?: string;
  filters?: string;
  dateRange?: string;
  totals?: { label: string; value: string }[];
};

function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function cellValue(col: ExportColumn, row: Record<string, unknown>): string {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  if (raw == null) return "";
  return String(raw);
}

export function rowsToCsv(
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  meta?: ExportMeta,
): string {
  const lines: string[] = [];
  if (meta?.title) lines.push(escapeCsv(meta.title));
  if (meta?.subtitle) lines.push(escapeCsv(meta.subtitle));
  if (meta?.filters) lines.push(escapeCsv(`Filters: ${meta.filters}`));
  if (meta?.dateRange) lines.push(escapeCsv(`Period: ${meta.dateRange}`));
  if (lines.length) lines.push("");
  lines.push(columns.map((c) => escapeCsv(c.label)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsv(cellValue(c, row))).join(","));
  }
  if (meta?.totals?.length) {
    lines.push("");
    for (const t of meta.totals) lines.push(`${escapeCsv(t.label)},${escapeCsv(t.value)}`);
  }
  return lines.join("\n");
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  meta?: ExportMeta,
): void {
  const csv = rowsToCsv(columns, rows, meta);
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

export async function exportXlsx(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  meta?: ExportMeta,
): Promise<void> {
  const XLSX = await import("xlsx");
  const sheetRows: unknown[][] = [];
  if (meta?.title) sheetRows.push([meta.title]);
  if (meta?.subtitle) sheetRows.push([meta.subtitle]);
  if (meta?.filters) sheetRows.push([`Filters: ${meta.filters}`]);
  if (meta?.dateRange) sheetRows.push([`Period: ${meta.dateRange}`]);
  if (sheetRows.length) sheetRows.push([]);
  sheetRows.push(columns.map((c) => c.label));
  for (const row of rows) sheetRows.push(columns.map((c) => cellValue(c, row)));
  if (meta?.totals?.length) {
    sheetRows.push([]);
    for (const t of meta.totals) sheetRows.push([t.label, t.value]);
  }
  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(filename, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export async function exportPdf(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  meta?: ExportMeta,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  let y = 14;
  doc.setFontSize(14);
  doc.text(meta?.title ?? "Benben Export", 14, y);
  y += 6;
  doc.setFontSize(9);
  if (meta?.subtitle) {
    doc.text(meta.subtitle, 14, y);
    y += 5;
  }
  if (meta?.filters || meta?.dateRange) {
    const parts = [meta.filters && `Filters: ${meta.filters}`, meta.dateRange && `Period: ${meta.dateRange}`].filter(Boolean);
    doc.text(parts.join(" · "), 14, y);
    y += 5;
  }
  autoTable(doc, {
    startY: y + 2,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => cellValue(c, row))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  if (meta?.totals?.length) {
    const finalY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    let ty = finalY + 8;
    doc.setFontSize(9);
    for (const t of meta.totals) {
      doc.text(`${t.label}: ${t.value}`, 14, ty);
      ty += 5;
    }
  }
  doc.save(filename);
}

/** Shared class + styles for popup print and in-app preview (pixel-identical layout). */
export const PRINT_REPORT_SHEET_CLASS = "benben-print-sheet";

export const PRINT_REPORT_SHEET_STYLES = `
  .${PRINT_REPORT_SHEET_CLASS} {
    font-family: Inter, system-ui, sans-serif;
    font-size: 11px;
    color: #0f172a;
    padding: 24px;
    background: #ffffff;
  }
  .${PRINT_REPORT_SHEET_CLASS} h1 {
    font-size: 16px;
    margin: 0 0 4px;
  }
  .${PRINT_REPORT_SHEET_CLASS} .meta {
    color: #64748b;
    font-size: 10px;
    margin-bottom: 16px;
  }
  .${PRINT_REPORT_SHEET_CLASS} table {
    width: 100%;
    border-collapse: collapse;
  }
  .${PRINT_REPORT_SHEET_CLASS} th,
  .${PRINT_REPORT_SHEET_CLASS} td {
    border: 1px solid #e2e8f0;
    padding: 6px 8px;
    text-align: left;
  }
  .${PRINT_REPORT_SHEET_CLASS} th {
    background: #f1f5f9;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .${PRINT_REPORT_SHEET_CLASS} td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .${PRINT_REPORT_SHEET_CLASS} .totals {
    margin-top: 12px;
    font-weight: 600;
  }
  @media print {
  .${PRINT_REPORT_SHEET_CLASS} {
    padding: 12px;
  }
  }
`;

function wrapPrintReportHtml(html: string): string {
  return `<div class="${PRINT_REPORT_SHEET_CLASS}">${html}</div>`;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPrintDocumentHtml(html: string, title = "Benben Report"): string {
  const safeTitle = escapeHtmlText(title);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>${PRINT_REPORT_SHEET_STYLES}
  body { margin: 0; background: #ffffff; }
</style></head><body>${wrapPrintReportHtml(html)}</body></html>`;
}

function printHtmlInHiddenFrame(fullHtml: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const frameDoc = iframe.contentDocument;
  const frameWin = iframe.contentWindow;
  if (!frameDoc || !frameWin) {
    iframe.remove();
    throw new Error("Could not create print frame.");
  }
  frameDoc.open();
  frameDoc.write(fullHtml);
  frameDoc.close();
  frameWin.focus();
  frameWin.print();
  window.setTimeout(() => iframe.remove(), 1000);
}

/** Opens the OS print dialog (used after preview confirmation). */
export async function executePrintReport(html: string, title = "Benben Report"): Promise<void> {
  const documentHtml = buildPrintDocumentHtml(html, title);

  if (typeof window !== "undefined" && window.benben?.printHtml) {
    const result = await window.benben.printHtml(documentHtml);
    if (!result.ok) {
      throw new Error(result.error ?? "Print failed.");
    }
    return;
  }

  printHtmlInHiddenFrame(documentHtml);
}

/** Opens in-app print preview before sending to the hardware print dialog. */
export function printReport(html: string, title = "Benben Report"): void {
  openPrintPreview({ html, title });
}

export function buildPrintTableHtml(
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  meta?: ExportMeta,
): string {
  const head = columns.map((c) => `<th>${c.label}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => {
            const cls = c.align === "right" ? ' class="num"' : "";
            return `<td${cls}>${cellValue(c, row)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const metaHtml = [
    meta?.title && `<h1>${meta.title}</h1>`,
    (meta?.subtitle || meta?.filters || meta?.dateRange) &&
      `<div class="meta">${[meta.subtitle, meta.filters && `Filters: ${meta.filters}`, meta.dateRange && `Period: ${meta.dateRange}`]
        .filter(Boolean)
        .join(" · ")}</div>`,
  ]
    .filter(Boolean)
    .join("");
  const totals =
    meta?.totals?.map((t) => `<div class="totals">${t.label}: ${t.value}</div>`).join("") ?? "";
  return `${metaHtml}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${totals}`;
}
