import { ipcMain } from "electron";

import { IPC } from "../constants";
import { importExternalPayrollCsv } from "../services/external-payroll-import.service";
import { calculatePayrollRun, finalizePayrollRun } from "../services/payrollService";
import { requireHrPayrollAccess } from "./permission-guard";
import { logIpcActivity } from "./audit-context";

function ipcError(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
}

async function requirePayrollExecute(
  event: Parameters<typeof requireHrPayrollAccess>[0],
  payload: unknown,
) {
  const ctx = await requireHrPayrollAccess(event, payload);
  if (!ctx.permissions.execute_payroll && !ctx.permissions.manage_users) {
    throw new Error("Permission denied: execute_payroll");
  }
  return ctx;
}

export function registerPayrollIpc(): void {
  ipcMain.handle(
    IPC.payroll.calculate,
    async (event, payload: { token?: string; payrollRunId: string }) => {
      try {
        await requirePayrollExecute(event, payload);
        const data = await calculatePayrollRun(payload.payrollRunId);
        await logIpcActivity(event, payload, {
          module: "HR",
          action: "PAYROLL_RUN_CALCULATED",
          entityType: "PayrollRun",
          entityId: payload.payrollRunId,
          summary: `Payroll calculated · gross ${(data as { grossPay?: number }).grossPay ?? "—"}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.payroll.finalize,
    async (event, payload: { token?: string; payrollRunId: string }) => {
      try {
        await requirePayrollExecute(event, payload);
        const data = await finalizePayrollRun(payload.payrollRunId);
        await logIpcActivity(event, payload, {
          module: "HR",
          action: "PAYROLL_RUN_FINALIZED",
          entityType: "PayrollRun",
          entityId: payload.payrollRunId,
          summary: `Payroll finalized and posted to ledger`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.payroll.importExternal,
    async (
      event,
      payload: { token?: string; filePath: string; entryDate?: string; idempotencyKey?: string },
    ) => {
      try {
        await requirePayrollExecute(event, payload);
        const data = await importExternalPayrollCsv(payload.filePath, {
          entryDate: payload.entryDate,
          idempotencyKey: payload.idempotencyKey,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );
}
