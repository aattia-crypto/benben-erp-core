import { getArAging } from "./ar.service";
import { getApAging } from "./ap.service";
import { getBalanceSheet, getProfitAndLoss, getTrialBalance } from "./gl-read.service";
import { getTaxSummaryReport } from "./tax.service";
import { getBudgetVarianceReport } from "./budget.service";

export async function getFinanceReports(
  reportId: string,
  params: { from?: string; to?: string; fiscalYear?: number },
) {
  const year = params.fiscalYear ?? new Date().getFullYear();
  switch (reportId) {
    case "trial-balance":
      return { id: reportId, title: "Trial Balance", rows: await getTrialBalance() };
    case "balance-sheet":
      return { id: reportId, title: "Balance Sheet", ...(await getBalanceSheet()) };
    case "profit-loss":
      return {
        id: reportId,
        title: "Profit & Loss",
        ...(await getProfitAndLoss({ from: params.from, to: params.to })),
      };
    case "ar-aging":
      return { id: reportId, title: "AR Aging", buckets: await getArAging() };
    case "ap-aging":
      return { id: reportId, title: "AP Aging", buckets: await getApAging() };
    case "tax-summary": {
      const from = params.from ?? `${year}-01-01`;
      const to = params.to ?? new Date().toISOString().slice(0, 10);
      return { id: reportId, title: "Tax Summary", ...(await getTaxSummaryReport({ from, to })) };
    }
    case "budget-variance":
      return {
        id: reportId,
        title: "Budget vs Actual",
        ...(await getBudgetVarianceReport({ fiscalYear: year })),
      };
    default:
      throw new Error(`Unknown report: ${reportId}`);
  }
}
