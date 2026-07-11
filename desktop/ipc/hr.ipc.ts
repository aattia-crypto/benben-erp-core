import { ipcMain } from "electron";

import { IPC } from "../constants";
import * as hrService from "../services/hr.service";
import {
  requireHrPayrollAccess,
  requireHrPayrollOrUserAdmin,
} from "./permission-guard";
import { logIpcActivity } from "./audit-context";

function ipcError(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
}

async function requireHrMutationPermission(
  event: Parameters<typeof requireHrPayrollAccess>[0],
  payload: unknown,
  key: "access_hr" | "execute_payroll",
) {
  const ctx = await requireHrPayrollAccess(event, payload);
  if (!ctx.permissions[key] && !ctx.permissions.manage_users) {
    throw new Error(`Permission denied: ${key}`);
  }
  return ctx;
}

export function registerHrIpc(): void {
  ipcMain.handle(IPC.hr.listActiveEmployees, async (event, payload: { token?: string }) => {
    try {
      await requireHrPayrollOrUserAdmin(event, payload);
      const data = await hrService.listActiveEmployees();
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(IPC.hr.getEmployees, async (event, payload: { token?: string }) => {
    try {
      await requireHrPayrollAccess(event, payload);
      const data = await hrService.listEmployees();
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    IPC.hr.createEmployee,
    async (event, payload: { token?: string } & hrService.CreateEmployeeInput) => {
      try {
        await requireHrMutationPermission(event, payload, "access_hr");
        const { token: _t, ...input } = payload;
        const data = await hrService.createEmployee(input);
        await logIpcActivity(event, payload, {
          module: "HR",
          action: "EMPLOYEE_CREATED",
          entityType: "Employee",
          entityId: (data as { id?: string }).id,
          summary: `Employee ${input.name} · ${input.jobTitle ?? "—"}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(IPC.hr.getTimecards, async (event, payload: { token?: string }) => {
    try {
      await requireHrPayrollAccess(event, payload);
      const data = await hrService.listTimecards();
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    IPC.hr.createTimecard,
    async (event, payload: { token?: string } & hrService.CreateTimecardInput) => {
      try {
        await requireHrMutationPermission(event, payload, "access_hr");
        const { token: _t, ...input } = payload;
        const data = await hrService.createTimecard(input);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.hr.approveTimecard,
    async (event, payload: { token?: string; timecardId: string }) => {
      try {
        await requireHrMutationPermission(event, payload, "access_hr");
        const data = await hrService.approveTimecard(payload.timecardId);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(IPC.hr.getPayrollRuns, async (event, payload: { token?: string }) => {
    try {
      await requireHrPayrollAccess(event, payload);
      const data = await hrService.listPayrollRuns();
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    IPC.hr.createPayrollRun,
    async (event, payload: { token?: string } & hrService.CreatePayrollRunInput) => {
      try {
        await requireHrMutationPermission(event, payload, "execute_payroll");
        const { token: _t, ...input } = payload;
        const data = await hrService.createPayrollRun(input);
        await logIpcActivity(event, payload, {
          module: "HR",
          action: "PAYROLL_RUN_CREATED",
          entityType: "PayrollRun",
          entityId: (data as { id?: string }).id,
          summary: `Payroll period ${input.periodStart} – ${input.periodEnd}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );
}
