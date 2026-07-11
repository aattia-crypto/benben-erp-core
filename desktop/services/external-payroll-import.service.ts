/**
 * External payroll CSV import (Gusto / ADP / Paychex-style summary files).
 * Posts balanced accrual journals via rc2 GL bridge — source EXTERNAL_PAYROLL_IMPORT.
 */
import fs from "node:fs";

import { getPrisma } from "./database";
import { logActivity } from "./audit.service";
import { logger } from "../utils/logger";
import { postJournalWithIntegrity } from "./finance/journal-post.service";
import { ORG_DEFAULT } from "./finance/types";
import type { JournalLineInput } from "./finance/types";
import { ensurePayrollGlAccounts, PAYROLL_GL } from "./payrollService";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export const EXTERNAL_PAYROLL_GL = {
  payrollTaxExpense: "6310",
} as const;

const PAYROLL_TAX_EXPENSE_ACCOUNT = {
  code: EXTERNAL_PAYROLL_GL.payrollTaxExpense,
  name: "Payroll Tax Expense",
  type: "EXPENSE",
} as const;

export type ExternalPayrollSummary = {
  grossWages: number;
  employeeTaxes: number;
  employerTaxes: number;
  benefits: number;
  netPay: number;
  provider?: string;
  payDate?: string;
};

export type ExternalPayrollImportResult = {
  summary: ExternalPayrollSummary;
  journalEntryId: string;
  duplicate: boolean;
  rowsParsed: number;
};

type ColumnAliases = Record<keyof ExternalPayrollSummary, string[]>;

const COLUMN_ALIASES: ColumnAliases = {
  grossWages: ["gross", "gross wages", "gross pay", "total gross", "wages", "gross earnings"],
  employeeTaxes: ["employee tax", "employee taxes", "ee tax", "ee taxes", "tax employee"],
  employerTaxes: ["employer tax", "employer taxes", "er tax", "er taxes", "tax employer"],
  benefits: ["benefits", "benefit deductions", "health", "401k", "deductions benefits"],
  netPay: ["net pay", "net", "take home", "net wages", "check amount"],
  provider: ["provider", "payroll provider", "source"],
  payDate: ["pay date", "check date", "payment date", "period end"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? ROUND(n) : 0;
}

function detectColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Parse flexible provider CSV into a single aggregated summary (sums numeric columns). */
export function parseExternalPayrollCsv(content: string): ExternalPayrollSummary {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  const headers = parseCsvLine(lines[0]);
  const idx = {
    grossWages: detectColumnIndex(headers, COLUMN_ALIASES.grossWages),
    employeeTaxes: detectColumnIndex(headers, COLUMN_ALIASES.employeeTaxes),
    employerTaxes: detectColumnIndex(headers, COLUMN_ALIASES.employerTaxes),
    benefits: detectColumnIndex(headers, COLUMN_ALIASES.benefits),
    netPay: detectColumnIndex(headers, COLUMN_ALIASES.netPay),
    provider: detectColumnIndex(headers, COLUMN_ALIASES.provider ?? []),
    payDate: detectColumnIndex(headers, COLUMN_ALIASES.payDate ?? []),
  };

  if (idx.grossWages < 0 && idx.netPay < 0) {
    throw new Error(
      "Could not map CSV columns. Include Gross Wages and/or Net Pay headers (Gusto/ADP/Paychex export).",
    );
  }

  const summary: ExternalPayrollSummary = {
    grossWages: 0,
    employeeTaxes: 0,
    employerTaxes: 0,
    benefits: 0,
    netPay: 0,
  };

  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    if (idx.grossWages >= 0) summary.grossWages += parseMoney(cols[idx.grossWages] ?? "0");
    if (idx.employeeTaxes >= 0) summary.employeeTaxes += parseMoney(cols[idx.employeeTaxes] ?? "0");
    if (idx.employerTaxes >= 0) summary.employerTaxes += parseMoney(cols[idx.employerTaxes] ?? "0");
    if (idx.benefits >= 0) summary.benefits += parseMoney(cols[idx.benefits] ?? "0");
    if (idx.netPay >= 0) summary.netPay += parseMoney(cols[idx.netPay] ?? "0");
    if (r === 1) {
      if (idx.provider >= 0) summary.provider = cols[idx.provider]?.trim();
      if (idx.payDate >= 0) summary.payDate = cols[idx.payDate]?.trim();
    }
  }

  summary.grossWages = ROUND(summary.grossWages);
  summary.employeeTaxes = ROUND(summary.employeeTaxes);
  summary.employerTaxes = ROUND(summary.employerTaxes);
  summary.benefits = ROUND(summary.benefits);
  summary.netPay = ROUND(summary.netPay);

  if (summary.grossWages <= 0 && summary.netPay <= 0) {
    throw new Error("No payroll amounts detected in CSV rows.");
  }

  if (summary.netPay <= 0 && summary.grossWages > 0) {
    summary.netPay = ROUND(
      summary.grossWages - summary.employeeTaxes - summary.benefits,
    );
  }

  return summary;
}

async function ensureExternalPayrollGlAccounts(orgId = ORG_DEFAULT): Promise<void> {
  await ensurePayrollGlAccounts(orgId);
  const db = getPrisma();
  await db.glAccount.upsert({
    where: { orgId_code: { orgId, code: PAYROLL_TAX_EXPENSE_ACCOUNT.code } },
    create: {
      orgId,
      code: PAYROLL_TAX_EXPENSE_ACCOUNT.code,
      name: PAYROLL_TAX_EXPENSE_ACCOUNT.name,
      type: PAYROLL_TAX_EXPENSE_ACCOUNT.type,
      currency: "USD",
    },
    update: { name: PAYROLL_TAX_EXPENSE_ACCOUNT.name, type: PAYROLL_TAX_EXPENSE_ACCOUNT.type },
  });
}

function buildBalancedLines(summary: ExternalPayrollSummary): JournalLineInput[] {
  const taxWithheld = ROUND(summary.employeeTaxes + summary.employerTaxes);
  const lines: JournalLineInput[] = [
    {
      accountCode: PAYROLL_GL.wagesExpense,
      debit: summary.grossWages,
      credit: 0,
      description: "External gross wages",
    },
  ];

  if (summary.employerTaxes > 0) {
    lines.push({
      accountCode: EXTERNAL_PAYROLL_GL.payrollTaxExpense,
      debit: summary.employerTaxes,
      credit: 0,
      description: "Employer payroll taxes",
    });
  }

  if (summary.benefits > 0) {
    lines.push({
      accountCode: PAYROLL_GL.wagesExpense,
      debit: summary.benefits,
      credit: 0,
      description: "Benefits & other deductions expense",
    });
  }

  if (taxWithheld > 0) {
    lines.push({
      accountCode: PAYROLL_GL.payrollLiability,
      debit: 0,
      credit: taxWithheld,
      description: "Payroll tax liabilities",
    });
  }

  if (summary.netPay > 0) {
    lines.push({
      accountCode: PAYROLL_GL.payrollLiability,
      debit: 0,
      credit: summary.netPay,
      description: "Net pay liability",
    });
  }

  const debitSum = ROUND(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const creditSum = ROUND(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  const diff = ROUND(debitSum - creditSum);
  if (diff !== 0) {
    lines.push({
      accountCode: PAYROLL_GL.payrollLiability,
      debit: diff < 0 ? Math.abs(diff) : 0,
      credit: diff > 0 ? diff : 0,
      description: "Rounding / reconciliation",
    });
  }

  return lines;
}

export async function importExternalPayrollCsv(
  filePath: string,
  options?: { idempotencyKey?: string; entryDate?: string },
  orgId = ORG_DEFAULT,
): Promise<ExternalPayrollImportResult> {
  const content = fs.readFileSync(filePath, "utf8");
  const summary = parseExternalPayrollCsv(content);
  const rowsParsed = content.split(/\r?\n/).filter((l) => l.trim()).length - 1;

  await ensureExternalPayrollGlAccounts(orgId);

  const entryDate = options?.entryDate ? new Date(options.entryDate) : new Date();
  const reference = `EXT-PAYROLL-${entryDate.toISOString().slice(0, 10)}`;
  const fingerprint =
    options?.idempotencyKey ?? `external-payroll-${reference}-${summary.grossWages}-${summary.netPay}`;

  const posted = await postJournalWithIntegrity(
    {
      memo: `External payroll import${summary.provider ? ` · ${summary.provider}` : ""}`,
      lines: buildBalancedLines(summary),
      source: "EXTERNAL_PAYROLL_IMPORT",
      module: "payroll",
      reference,
      entryDate,
      idempotencyKey: fingerprint,
    },
    orgId,
  );

  await logActivity({
    orgId,
    module: "payroll",
    action: "EXTERNAL_PAYROLL_IMPORTED",
    entityType: "GlJournalEntry",
    entityId: posted.id,
    summary: reference,
    afterJson: JSON.stringify({ summary, duplicate: posted.duplicate }),
  });

  logger.info("External payroll imported", { journalEntryId: posted.id, summary });

  return {
    summary,
    journalEntryId: posted.id,
    duplicate: posted.duplicate,
    rowsParsed,
  };
}
