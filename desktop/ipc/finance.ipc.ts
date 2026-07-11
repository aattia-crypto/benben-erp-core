import { ipcMain } from "electron";

import { IPC } from "../constants";
import { runConsolidationWithFxReport } from "../services/finance/currency.service";
import { calculateTransactionTax } from "../services/finance/tax.service";
import { createSampleOperationsBudget } from "../services/finance/budget.service";
import { assertTokenPermission } from "../services/permissions.service";
import { logIpcActivity } from "./audit-context";

function ipcError(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
}

export function registerFinanceIpc(): void {
  ipcMain.handle(
    IPC.finance.runConsolidation,
    async (
      event,
      payload: {
        token?: string;
        periodYear?: number;
        periodMonth?: number;
        fxRate: number;
        fromCurrency?: string;
        functionalCurrency?: string;
      },
    ) => {
      try {
        await assertTokenPermission(payload?.token, "view_finance");
        const now = new Date();
        const data = await runConsolidationWithFxReport({
          periodYear: payload.periodYear ?? now.getFullYear(),
          periodMonth: payload.periodMonth ?? now.getMonth() + 1,
          fxRate: Number(payload.fxRate),
          fromCurrency: payload.fromCurrency,
          functionalCurrency: payload.functionalCurrency,
        });
        await logIpcActivity(event, payload, {
          module: "FINANCE",
          action: "CONSOLIDATION_RUN",
          entityType: "ConsolidationRun",
          entityId: (data.run as { id?: string })?.id,
          summary: `FX consolidation · rate ${payload.fxRate} · net ${data.consolidatedNetBalanceFormatted ?? data.consolidatedNetBalance}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.finance.calculateTax,
    async (
      event,
      payload: {
        token?: string;
        taxZoneCode?: string;
        invoiceRef?: string;
        amount?: number;
      },
    ) => {
      try {
        await assertTokenPermission(payload?.token, "view_finance");
        const invoiceRef = payload.invoiceRef ?? `INV-${Date.now()}`;
        const amount = Number(payload.amount ?? 100);
        const data = await calculateTransactionTax({
          taxZoneCode: payload.taxZoneCode ?? "US-DEFAULT",
          persistSnapshot: true,
          invoiceRef,
          lines: [{ lineId: "1", amount, taxCategory: "STANDARD" }],
        });
        await logIpcActivity(event, payload, {
          module: "FINANCE",
          action: "TAX_CALCULATED",
          entityType: "TaxInvoiceSnapshot",
          entityId: data.snapshotId,
          summary: `Sample tax · total ${data.taxTotal} · invoice ${invoiceRef}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.finance.createSampleBudget,
    async (event, payload: { token?: string; fiscalYear?: number }) => {
      try {
        await assertTokenPermission(payload?.token, "view_finance");
        const data = await createSampleOperationsBudget(payload.fiscalYear);
        await logIpcActivity(event, payload, {
          module: "FINANCE",
          action: "BUDGET_CREATED",
          entityType: "BudgetPlan",
          entityId: (data as { id?: string })?.id,
          summary: `Sample budget COST_CENTER_OPS · FY${payload.fiscalYear ?? new Date().getFullYear()}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );
}
