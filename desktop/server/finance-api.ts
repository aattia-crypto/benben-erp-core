import type { ServerResponse } from "node:http";

import {
  autoMatchBankTransactions,
  manualMatchBankTransaction,
  uploadBankStatement,
} from "../services/finance/bank-reconciliation.service";
import { createBudgetPlan, createSampleOperationsBudget, getBudgetVarianceReport, validateBudgetAvailability } from "../services/finance/budget.service";
import {
  runConsolidation,
  runConsolidationWithFxReport,
  updateExchangeRates,
  type ExchangeRateUpdateInput,
} from "../services/finance/currency.service";
import {
  buildDepreciationSchedule,
  createFixedAsset,
  runMonthlyDepreciation,
} from "../services/finance/fixed-assets.service";
import {
  getFinanceDashboard,
  listBankTransactions,
  listBudgetPlans,
  listFixedAssets,
  listFxRevaluations,
} from "../services/finance/finance-query.service";
import {
  createArInvoice,
  applyArPayment,
  createArCreditMemo,
  getArAging,
  getArInvoiceDetail,
  getCustomerLedger,
  listArInvoices,
} from "../services/finance/ar.service";
import {
  approveApBill,
  createApBill,
  createApVendorCredit,
  getApAging,
  getApBillDetail,
  getVendorLedger,
  listApBills,
  payApBill,
} from "../services/finance/ap.service";
import { postJournalWithIntegrity } from "../services/finance/journal-post.service";
import { listRecentActivity, listSystemLogs, logActivity } from "../services/audit.service";
import { getFinanceReports } from "../services/finance/report.service";
import {
  getAccountLedger,
  getBalanceSheet,
  getChartWithBalances,
  getProfitAndLoss,
  getTrialBalance,
  listJournalEntries,
  reverseJournalEntry,
} from "../services/finance/gl-read.service";
import { getExtendedSystemHealth } from "../services/system-status.service";
import { calculateTransactionTax, getTaxSummaryReport } from "../services/finance/tax.service";
import { triggerRevRecMilestone, getRevRecDashboard, createRevRecSchedule } from "../services/finance/rev-rec.service";
import { capitalizeWip, getWipLedgerDashboard } from "../services/finance/wip.service";
import { assertTokenPermission } from "../services/permissions.service";
import type { JsonRequestContext } from "./http-utils";
import { matchRoute, sendError, sendJson } from "./http-utils";

async function requireModifyGeneralLedger(
  ctx: JsonRequestContext,
  res: ServerResponse,
): Promise<boolean> {
  if (!ctx.token) return true;
  try {
    await assertTokenPermission(ctx.token, "modify_general_ledger");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 403, message);
    return false;
  }
}

type Handler = (
  ctx: JsonRequestContext,
  res: ServerResponse,
  params: Record<string, string>,
  search: URLSearchParams,
) => Promise<void>;

const routes: { method: string; pattern: string; handler: Handler }[] = [
  {
    method: "GET",
    pattern: "/api/finance/dashboard",
    handler: async (_ctx, res) => {
      sendJson(res, 200, await getFinanceDashboard());
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/gl/entries",
    handler: async (_ctx, res, _params, search) => {
      const entries = await listJournalEntries({
        from: search.get("from") ?? undefined,
        to: search.get("to") ?? undefined,
        accountCode: search.get("accountCode") ?? undefined,
        source: search.get("source") ?? undefined,
        reference: search.get("reference") ?? undefined,
        limit: search.get("limit") ? Number(search.get("limit")) : undefined,
      });
      sendJson(res, 200, { entries });
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/gl/entries",
    handler: async (ctx, res) => {
      if (!(await requireModifyGeneralLedger(ctx, res))) return;
      const body = ctx.body as Record<string, unknown>;
      const lines = Array.isArray(body.lines) ? (body.lines as never[]) : [];
      const posted = await postJournalWithIntegrity({
        memo: String(body.memo ?? ""),
        source: body.source ? String(body.source) : "MANUAL",
        module: body.module ? String(body.module) : "gl",
        reference: body.reference ? String(body.reference) : undefined,
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
        lines,
      });
      const db = await import("../services/database").then((m) => m.getPrisma());
      const entry = await db.glJournalEntry.findUnique({
        where: { id: posted.id },
        include: { lines: true },
      });
      sendJson(res, 201, { ...entry, duplicate: posted.duplicate });
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/gl/entries/{id}/reverse",
    handler: async (ctx, res, params) => {
      if (!(await requireModifyGeneralLedger(ctx, res))) return;
      const entry = await reverseJournalEntry(params.id);
      sendJson(res, 200, entry);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/gl/trial-balance",
    handler: async (_ctx, res) => {
      sendJson(res, 200, { rows: await getTrialBalance() });
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/gl/accounts",
    handler: async (_ctx, res) => {
      sendJson(res, 200, { accounts: await getChartWithBalances() });
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/gl/general-ledger/{accountCode}",
    handler: async (_ctx, res, params) => {
      sendJson(res, 200, await getAccountLedger(params.accountCode));
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/gl/balance-sheet",
    handler: async (_ctx, res) => {
      sendJson(res, 200, await getBalanceSheet());
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/gl/profit-loss",
    handler: async (_ctx, res, _params, search) => {
      sendJson(
        res,
        200,
        await getProfitAndLoss({
          from: search.get("from") ?? undefined,
          to: search.get("to") ?? undefined,
        }),
      );
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/ar/invoices",
    handler: async (_ctx, res) => {
      sendJson(res, 200, { invoices: await listArInvoices() });
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/ar/invoices",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const inv = await createArInvoice({
        customerCode: String(body.customerCode),
        customerName: String(body.customerName),
        lines: Array.isArray(body.lines) ? (body.lines as never[]) : [],
        subtotal: Number(body.subtotal),
        tax: Number(body.tax ?? 0),
        shipping: body.shipping != null ? Number(body.shipping) : 0,
        discount: body.discount != null ? Number(body.discount) : 0,
        terms: body.terms ? String(body.terms) : undefined,
        issuedAt: String(body.issuedAt),
        dueAt: String(body.dueAt),
        source: body.source ? String(body.source) : undefined,
        sourceRef: body.sourceRef ? String(body.sourceRef) : undefined,
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      sendJson(res, 201, inv);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/ar/payments",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const pay = await applyArPayment({
        customerCode: String(body.customerCode),
        amount: Number(body.amount),
        allocations: Array.isArray(body.allocations) ? (body.allocations as never[]) : [],
        method: String(body.method ?? "ach"),
        memo: body.memo ? String(body.memo) : undefined,
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      sendJson(res, 201, pay);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/ar/credit-memos",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const memo = await createArCreditMemo({
        customerCode: String(body.customerCode),
        amount: Number(body.amount),
        reason: String(body.reason),
        invoiceId: body.invoiceId ? String(body.invoiceId) : undefined,
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      sendJson(res, 201, memo);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/ar/invoices/{invoiceId}",
    handler: async (_ctx, res, params) => {
      sendJson(res, 200, await getArInvoiceDetail(params.invoiceId));
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/ar/aging",
    handler: async (_ctx, res) => {
      sendJson(res, 200, await getArAging());
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/ar/ledger/{customerCode}",
    handler: async (_ctx, res, params) => {
      sendJson(res, 200, await getCustomerLedger(params.customerCode));
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/ap/bills",
    handler: async (_ctx, res) => {
      sendJson(res, 200, { bills: await listApBills() });
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/ap/bills",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const bill = await createApBill({
        vendorCode: String(body.vendorCode),
        vendorName: String(body.vendorName),
        poId: body.poId ? String(body.poId) : undefined,
        lines: Array.isArray(body.lines) ? (body.lines as never[]) : [],
        subtotal: Number(body.subtotal),
        tax: Number(body.tax ?? 0),
        total: Number(body.total),
        billDate: String(body.billDate),
        dueDate: String(body.dueDate),
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      sendJson(res, 201, bill);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/ap/payments",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const result = await payApBill({
        billId: String(body.billId),
        amount: Number(body.amount),
        method: String(body.method ?? "ach"),
        memo: body.memo ? String(body.memo) : undefined,
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      sendJson(res, 201, result);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/ap/vendor-credits",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const credit = await createApVendorCredit({
        vendorCode: String(body.vendorCode),
        amount: Number(body.amount),
        reason: String(body.reason),
        billId: body.billId ? String(body.billId) : undefined,
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      sendJson(res, 201, credit);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/ap/bills/{billId}",
    handler: async (_ctx, res, params) => {
      sendJson(res, 200, await getApBillDetail(params.billId));
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/ap/bills/{billId}/approve",
    handler: async (ctx, res, params) => {
      const body = ctx.body as Record<string, unknown>;
      const result = await approveApBill(params.billId, {
        costCenterCode: body.costCenterCode ? String(body.costCenterCode) : undefined,
        accountCode: body.accountCode ? String(body.accountCode) : undefined,
      });
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/ap/aging",
    handler: async (_ctx, res) => {
      sendJson(res, 200, await getApAging());
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/ap/ledger/{vendorCode}",
    handler: async (_ctx, res, params) => {
      sendJson(res, 200, await getVendorLedger(params.vendorCode));
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/reports/{reportId}",
    handler: async (_ctx, res, params, search) => {
      const report = await getFinanceReports(params.reportId, {
        from: search.get("from") ?? undefined,
        to: search.get("to") ?? undefined,
      });
      sendJson(res, 200, report);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/activity",
    handler: async (_ctx, res, _params, search) => {
      const hasFilters =
        search.get("module") ||
        search.get("entityType") ||
        search.get("action") ||
        search.get("from") ||
        search.get("to");
      if (hasFilters) {
        sendJson(
          res,
          200,
          await listSystemLogs({
            module: search.get("module") ?? undefined,
            entityType: search.get("entityType") ?? undefined,
            action: search.get("action") ?? undefined,
            from: search.get("from") ?? undefined,
            to: search.get("to") ?? undefined,
            limit: search.get("limit") ? Number(search.get("limit")) : 100,
          }),
        );
        return;
      }
      const limit = search.get("limit") ? Number(search.get("limit")) : 50;
      sendJson(res, 200, { activity: await listRecentActivity(limit) });
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/system/health",
    handler: async (_ctx, res) => {
      sendJson(res, 200, await getExtendedSystemHealth());
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/bank-transactions",
    handler: async (_ctx, res, _params, search) => {
      sendJson(res, 200, {
        transactions: await listBankTransactions({
          matchStatus: search.get("matchStatus") ?? undefined,
          statementId: search.get("statementId") ?? undefined,
        }),
      });
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/assets",
    handler: async (_ctx, res) => {
      sendJson(res, 200, { assets: await listFixedAssets() });
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/budgets",
    handler: async (_ctx, res) => {
      sendJson(res, 200, { plans: await listBudgetPlans() });
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/fx/revaluations",
    handler: async (_ctx, res) => {
      sendJson(res, 200, await listFxRevaluations());
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/bank-statements/upload",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const result = await uploadBankStatement({
        bankAccountCode: String(body.bankAccountCode ?? "1000"),
        statementDate: String(body.statementDate),
        periodStart: body.periodStart ? String(body.periodStart) : undefined,
        periodEnd: body.periodEnd ? String(body.periodEnd) : undefined,
        openingBalance: Number(body.openingBalance ?? 0),
        closingBalance: Number(body.closingBalance ?? 0),
        currency: body.currency ? String(body.currency) : undefined,
        fileName: body.fileName ? String(body.fileName) : undefined,
        transactions: Array.isArray(body.transactions) ? (body.transactions as never[]) : [],
      });
      sendJson(res, 201, result);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/reconcile/match-auto",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const result = await autoMatchBankTransactions({
        bankStatementId: String(body.bankStatementId),
        dateToleranceDays:
          body.dateToleranceDays != null ? Number(body.dateToleranceDays) : undefined,
        amountTolerance:
          body.amountTolerance != null ? Number(body.amountTolerance) : undefined,
      });
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/reconcile/match-manual",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const lineIds = Array.isArray(body.journalLineIds)
        ? (body.journalLineIds as string[])
        : body.journalLineId
          ? [String(body.journalLineId)]
          : [];
      const result = await manualMatchBankTransaction({
        bankTransactionId: String(body.bankTransactionId),
        journalLineIds: lineIds,
        matchedBy: body.matchedBy ? String(body.matchedBy) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
      });
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/assets",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const asset = await createFixedAsset({
        assetTag: String(body.assetTag),
        name: String(body.name),
        categoryCode: String(body.categoryCode ?? "GEN"),
        acquisitionDate: String(body.acquisitionDate),
        acquisitionCost: Number(body.acquisitionCost),
        salvageValue: body.salvageValue != null ? Number(body.salvageValue) : undefined,
        usefulLifeMonths:
          body.usefulLifeMonths != null ? Number(body.usefulLifeMonths) : undefined,
        depreciationMethod: body.depreciationMethod as never,
        currency: body.currency ? String(body.currency) : undefined,
      });
      sendJson(res, 201, asset);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/assets/{id}/depreciation-schedule",
    handler: async (_ctx, res, params) => {
      const schedule = await buildDepreciationSchedule(params.id);
      sendJson(res, 200, schedule);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/assets/depreciate-run",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const now = new Date();
      const runYear = body.runYear != null ? Number(body.runYear) : now.getFullYear();
      const runMonth = body.runMonth != null ? Number(body.runMonth) : now.getMonth() + 1;
      const result = await runMonthlyDepreciation(runYear, runMonth);
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/budgets",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const plan = await createBudgetPlan({
        name: String(body.name),
        fiscalYear: Number(body.fiscalYear),
        currency: body.currency ? String(body.currency) : undefined,
        status: body.status ? String(body.status) : undefined,
        lineItems: Array.isArray(body.lineItems) ? (body.lineItems as never[]) : [],
      });
      sendJson(res, 201, plan);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/budgets/variance-report",
    handler: async (_ctx, res, _params, search) => {
      const fiscalYear = Number(search.get("fiscalYear") ?? new Date().getFullYear());
      const budgetPlanId = search.get("budgetPlanId") ?? undefined;
      const report = await getBudgetVarianceReport({ fiscalYear, budgetPlanId });
      sendJson(res, 200, report);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/budgets/validate",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const result = await validateBudgetAvailability({
        costCenterCode: String(body.costCenterCode),
        accountCode: String(body.accountCode),
        amount: Number(body.amount),
        periodYear: Number(body.periodYear),
        periodMonth: Number(body.periodMonth),
        mode: body.mode as never,
      });
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/tax/calculate",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const result = await calculateTransactionTax({
        originAddress: body.originAddress ? String(body.originAddress) : undefined,
        destinationAddress: body.destinationAddress ? String(body.destinationAddress) : undefined,
        taxZoneCode: body.taxZoneCode ? String(body.taxZoneCode) : undefined,
        lines: Array.isArray(body.lines) ? (body.lines as never[]) : [],
        persistSnapshot: Boolean(body.persistSnapshot),
        invoiceRef: body.invoiceRef ? String(body.invoiceRef) : undefined,
      });
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/tax/reports/summary",
    handler: async (_ctx, res, _params, search) => {
      const from = search.get("from");
      const to = search.get("to");
      if (!from || !to) {
        sendError(res, 400, "Query params 'from' and 'to' are required (ISO dates).");
        return;
      }
      const report = await getTaxSummaryReport({ from, to });
      sendJson(res, 200, report);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/currency/rates-update",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const raw = Array.isArray(body.rates) ? body.rates : [body];
      const rates = raw as ExchangeRateUpdateInput[];
      const result = await updateExchangeRates(rates);
      await logActivity({
        module: "FINANCE",
        action: "FX_RATE_UPDATE",
        entityType: "ExchangeRate",
        summary: `Updated ${result.length} FX rate(s)`,
      });
      sendJson(res, 200, { updated: result.length, rates: result });
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/consolidation/run",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const now = new Date();
      const periodYear = Number(body.periodYear ?? now.getFullYear());
      const periodMonth = Number(body.periodMonth ?? now.getMonth() + 1);
      if (body.fxRate != null && Number(body.fxRate) > 0) {
        const result = await runConsolidationWithFxReport({
          periodYear,
          periodMonth,
          fxRate: Number(body.fxRate),
          fromCurrency: body.fromCurrency ? String(body.fromCurrency) : undefined,
          functionalCurrency: body.functionalCurrency ? String(body.functionalCurrency) : undefined,
          parentEntityCode: body.parentEntityCode ? String(body.parentEntityCode) : undefined,
        });
        sendJson(res, 200, result);
        return;
      }
      const result = await runConsolidation({
        periodYear,
        periodMonth,
        parentEntityCode: body.parentEntityCode ? String(body.parentEntityCode) : undefined,
        functionalCurrency: body.functionalCurrency ? String(body.functionalCurrency) : undefined,
      });
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/rev-rec/dashboard",
    handler: async (_ctx, res) => {
      sendJson(res, 200, await getRevRecDashboard());
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/rev-rec/schedules",
    handler: async (ctx, res) => {
      const body = ctx.body as Record<string, unknown>;
      const schedule = await createRevRecSchedule({
        invoiceId: body.invoiceId ? String(body.invoiceId) : undefined,
        totalAmount: Number(body.totalAmount),
        milestones: Array.isArray(body.milestones)
          ? (body.milestones as { milestoneName: string; percentage: number }[])
          : [],
      });
      sendJson(res, 201, schedule);
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/rev-rec/trigger-milestone",
    handler: async (ctx, res) => {
      if (!(await requireModifyGeneralLedger(ctx, res))) return;
      const body = ctx.body as Record<string, unknown>;
      const result = await triggerRevRecMilestone({
        milestoneId: String(body.milestoneId),
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET",
    pattern: "/api/finance/wip/ledger",
    handler: async (_ctx, res) => {
      sendJson(res, 200, await getWipLedgerDashboard());
    },
  },
  {
    method: "POST",
    pattern: "/api/finance/wip/capitalize",
    handler: async (ctx, res) => {
      if (!(await requireModifyGeneralLedger(ctx, res))) return;
      const body = ctx.body as Record<string, unknown>;
      const result = await capitalizeWip({
        amount: Number(body.amount),
        creditAccountCode: body.creditAccountCode ? String(body.creditAccountCode) : undefined,
        batchId: body.batchId ? String(body.batchId) : undefined,
        batchCode: body.batchCode ? String(body.batchCode) : undefined,
        memo: body.memo ? String(body.memo) : undefined,
        sourceRef: body.sourceRef ? String(body.sourceRef) : undefined,
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      sendJson(res, 201, result);
    },
  },
];

export async function handleFinanceApiRequest(
  ctx: JsonRequestContext,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(ctx.pathname, "http://local");
  const pathname = url.pathname;

  for (const route of routes) {
    if (route.method !== ctx.method) continue;
    const match = matchRoute(ctx.method, pathname, route.pattern);
    if (!match) continue;
    try {
      await route.handler(ctx, res, match.params, url.searchParams);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 400, message);
      return true;
    }
  }

  return false;
}
