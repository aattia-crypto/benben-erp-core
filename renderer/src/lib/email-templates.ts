import { getCompanyBranding } from "./org-profile";
import { getCompanyName } from "./workspace-store";
import { sanitizeUnicodeText } from "./locale-format";

function companyName(): string {
  return getCompanyBranding().legalName || getCompanyName() || "Benben";
}

function wrap(body: string): string {
  const b = getCompanyBranding();
  const footer = b.footerText || "Thank you for your business.";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:640px;margin:0 auto;padding:24px">
    <div style="border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:20px">
      <strong style="font-size:18px">${companyName()}</strong>
      ${b.tagline ? `<div style="color:#64748b;font-size:13px">${b.tagline}</div>` : ""}
    </div>
    ${sanitizeUnicodeText(body)}
    <p style="margin-top:32px;font-size:12px;color:#64748b">${footer}</p>
  </body></html>`;
}

export function invoiceEmailHtml(input: {
  invoiceNumber: string;
  customerName: string;
  total: string;
  balance: string;
  dueDate?: string;
}): string {
  return wrap(`
    <p>Dear ${input.customerName},</p>
    <p>Please find your invoice <strong>${input.invoiceNumber}</strong> below.</p>
    <table style="margin:16px 0;border-collapse:collapse">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Total</td><td><strong>${input.total}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Balance due</td><td><strong>${input.balance}</strong></td></tr>
      ${input.dueDate ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Due date</td><td>${input.dueDate}</td></tr>` : ""}
    </table>
    <p>Reply to this email if you have questions about this invoice.</p>
  `);
}

export function statementEmailHtml(input: {
  customerName: string;
  balance: string;
  invoiceCount: number;
}): string {
  return wrap(`
    <p>Dear ${input.customerName},</p>
    <p>Your account statement is ready.</p>
    <p><strong>Outstanding balance:</strong> ${input.balance}</p>
    <p>Open invoices on file: ${input.invoiceCount}</p>
    <p>Please remit payment for any overdue balances at your earliest convenience.</p>
  `);
}

export function crmReminderEmailHtml(input: {
  contactName: string;
  subject: string;
  dueAt: string;
  notes?: string;
}): string {
  return wrap(`
    <p>Hello ${input.contactName},</p>
    <p>This is a reminder regarding: <strong>${input.subject}</strong></p>
    <p>Due: ${input.dueAt}</p>
    ${input.notes ? `<p>${input.notes}</p>` : ""}
  `);
}

export function testEmailHtml(): string {
  return wrap(`<p>Your Benben ERP SMTP configuration is working correctly.</p>`);
}
