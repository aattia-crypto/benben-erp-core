import { contextBridge, ipcRenderer, webUtils } from "electron";

import { IPC } from "./constants";
import {
  getPresenterBypassToken,
  isPresenterAuthBypassEnabled,
} from "./utils/presenter-auth-bypass";
import { isDemoBuild } from "./utils/build-flavor";

let sessionToken: string | null = isPresenterAuthBypassEnabled() ? getPresenterBypassToken() : null;
let sessionOrgId: string | null = "default";

function clearToken(): void {
  sessionToken = null;
  sessionOrgId = "default";
}

function withAuth<T extends Record<string, unknown>>(
  payload?: T,
): T & { token: string | null; orgId: string | null } {
  return { ...(payload ?? ({} as T)), token: sessionToken, orgId: sessionOrgId };
}

const benben = {
  app: {
    getVersion: () => ipcRenderer.invoke(IPC.app.getVersion) as Promise<string>,
    getPaths: () => ipcRenderer.invoke(IPC.app.getPaths),
    ping: () => ipcRenderer.invoke(IPC.app.ping),
    getDiagnostics: () => ipcRenderer.invoke(IPC.app.getDiagnostics),
  },
  auth: {
    restoreSessionToken: (token: string | null, orgId?: string | null) => {
      sessionToken = token;
      if (orgId !== undefined) sessionOrgId = orgId;
    },
    getSessionToken: () => sessionToken,
    login: async (username: string, password: string) => {
      const res = await ipcRenderer.invoke(IPC.auth.login, { username, password });
      if (res?.ok && res.data?.token) {
        sessionToken = res.data.token as string;
        const session = (res.data as { session?: { orgId?: string } }).session;
        if (session?.orgId) sessionOrgId = session.orgId;
        const { token: _t, ...rest } = res.data as { token: string; session: unknown };
        return { ok: true, data: rest, token: sessionToken };
      }
      clearToken();
      return res;
    },
    logout: async () => {
      const res = await ipcRenderer.invoke(IPC.auth.logout, { token: sessionToken });
      clearToken();
      return res;
    },
    getSession: () => ipcRenderer.invoke(IPC.auth.getSession, { token: sessionToken }),
    changePassword: (newPassword: string, currentPassword?: string) =>
      ipcRenderer.invoke(IPC.auth.changePassword, withAuth({ newPassword, currentPassword })),
    initializeAdmin: async (input: {
      username: string;
      password: string;
      companyName: string;
    }) => {
      const res = await ipcRenderer.invoke(IPC.auth.initializeAdmin, input);
      if (res?.ok && res.data?.token) {
        sessionToken = res.data.token as string;
        const session = (res.data as { session?: { orgId?: string } }).session;
        if (session?.orgId) sessionOrgId = session.orgId;
        const { token: _t, ...rest } = res.data as { token: string; session: unknown };
        return { ok: true, data: rest, token: sessionToken };
      }
      clearToken();
      return res;
    },
    provisionUser: (input: {
      username: string;
      tempPassword: string;
      displayName: string;
      orgId: string;
      roleId: string;
      permissionsOverride?: Record<string, boolean> | null;
      employeeId?: string | null;
    }) => ipcRenderer.invoke(IPC.auth.provisionUser, withAuth(input)),
  },
  backup: {
    create: () => ipcRenderer.invoke(IPC.backup.create),
    list: () => ipcRenderer.invoke(IPC.backup.list),
    restore: (id: string) => ipcRenderer.invoke(IPC.backup.restore, id),
    getHealth: () => ipcRenderer.invoke(IPC.backup.getHealth),
    setPolicy: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.backup.setPolicy, patch),
    verify: (id: string) => ipcRenderer.invoke(IPC.backup.verify, id),
    runScheduled: () => ipcRenderer.invoke(IPC.backup.runScheduled),
  },
  email: {
    send: (input: unknown) => ipcRenderer.invoke(IPC.email.send, input),
    test: (payload: unknown) => ipcRenderer.invoke(IPC.email.test, payload),
    verifyConnection: (settings: unknown) => ipcRenderer.invoke(IPC.email.verifyConnection, settings),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke(IPC.dialog.pickFolder),
    pickFile: (filters?: { name: string; extensions: string[] }[]) =>
      ipcRenderer.invoke(IPC.dialog.pickFile, filters),
    validatePath: (targetPath: string) => ipcRenderer.invoke(IPC.dialog.validatePath, targetPath),
  },
  system: {
    getStatus: () => ipcRenderer.invoke(IPC.system.getStatus),
    listActivityLogs: (filters?: {
      module?: string;
      action?: string;
      limit?: number;
    }) => ipcRenderer.invoke(IPC.system.listActivityLogs, withAuth(filters ?? {})),
  },
  update: {
    check: (channel: string) => ipcRenderer.invoke(IPC.update.check, channel),
    getStatus: () => ipcRenderer.invoke(IPC.update.getStatus),
  },
  support: {
    exportBundle: (extra?: unknown) => ipcRenderer.invoke(IPC.support.exportBundle, extra),
  },
  hr: {
    getEmployees: () => ipcRenderer.invoke(IPC.hr.getEmployees, withAuth()),
    listActiveEmployees: () => ipcRenderer.invoke(IPC.hr.listActiveEmployees, withAuth()),
    createEmployee: (input: unknown) =>
      ipcRenderer.invoke(IPC.hr.createEmployee, withAuth(input as Record<string, unknown>)),
    getTimecards: () => ipcRenderer.invoke(IPC.hr.getTimecards, withAuth()),
    createTimecard: (input: unknown) =>
      ipcRenderer.invoke(IPC.hr.createTimecard, withAuth(input as Record<string, unknown>)),
    approveTimecard: (timecardId: string) =>
      ipcRenderer.invoke(IPC.hr.approveTimecard, withAuth({ timecardId })),
    getPayrollRuns: () => ipcRenderer.invoke(IPC.hr.getPayrollRuns, withAuth()),
    createPayrollRun: (input: unknown) =>
      ipcRenderer.invoke(IPC.hr.createPayrollRun, withAuth(input as Record<string, unknown>)),
  },
  payroll: {
    calculate: (payrollRunId: string) =>
      ipcRenderer.invoke(IPC.payroll.calculate, withAuth({ payrollRunId })),
    finalize: (payrollRunId: string) =>
      ipcRenderer.invoke(IPC.payroll.finalize, withAuth({ payrollRunId })),
    importExternal: (input: { filePath: string; entryDate?: string; idempotencyKey?: string }) =>
      ipcRenderer.invoke(IPC.payroll.importExternal, withAuth(input)),
  },
  permissions: {
    listRoles: () => ipcRenderer.invoke(IPC.permissions.listRoles, withAuth()),
    updateRole: (roleId: string, permissions: Record<string, boolean>) =>
      ipcRenderer.invoke(IPC.permissions.updateRole, withAuth({ roleId, permissions })),
    assignUserRole: (
      userId: string,
      roleId: string,
      permissionsOverride?: Record<string, boolean> | null,
    ) =>
      ipcRenderer.invoke(
        IPC.permissions.assignUserRole,
        withAuth({ userId, roleId, permissionsOverride }),
      ),
    getForUser: (userId: string) =>
      ipcRenderer.invoke(IPC.permissions.getForUser, withAuth({ userId })),
    listUsers: () => ipcRenderer.invoke(IPC.permissions.listUsers, withAuth()),
    deactivateUser: (userId: string) =>
      ipcRenderer.invoke(IPC.permissions.deactivateUser, withAuth({ userId })),
    reactivateUser: (userId: string) =>
      ipcRenderer.invoke(IPC.permissions.reactivateUser, withAuth({ userId })),
    deleteUser: (userId: string) =>
      ipcRenderer.invoke(IPC.permissions.deleteUser, withAuth({ userId })),
    resetUserPassword: (userId: string, newPassword: string) =>
      ipcRenderer.invoke(IPC.permissions.resetUserPassword, withAuth({ userId, newPassword })),
  },
  finance: {
    runConsolidation: (input: {
      fxRate: number;
      periodYear?: number;
      periodMonth?: number;
      fromCurrency?: string;
      functionalCurrency?: string;
    }) => ipcRenderer.invoke(IPC.finance.runConsolidation, withAuth(input)),
    calculateTax: (input?: { taxZoneCode?: string; invoiceRef?: string; amount?: number }) =>
      ipcRenderer.invoke(IPC.finance.calculateTax, withAuth(input ?? {})),
    createSampleBudget: (fiscalYear?: number) =>
      ipcRenderer.invoke(IPC.finance.createSampleBudget, withAuth({ fiscalYear })),
  },
  ai: {
    sendQuery: (prompt: string) =>
      ipcRenderer.invoke(IPC.ai.sendQuery, withAuth({ prompt })),
    getStatus: () => ipcRenderer.invoke(IPC.ai.getStatus, withAuth()),
    saveApiKey: (apiKey: string) =>
      ipcRenderer.invoke(IPC.ai.saveApiKey, withAuth({ apiKey })),
  },
  licensing: {
    getStatus: () => ipcRenderer.invoke(IPC.licensing.getStatus),
    getMachineFingerprint: () => ipcRenderer.invoke(IPC.licensing.getMachineFingerprint),
    activate: (activationKey: string, seatCount?: number) =>
      ipcRenderer.invoke(IPC.licensing.activate, { activationKey, seatCount }),
    saveLocalLicense: (licenseData: unknown, key: string) =>
      ipcRenderer.sendSync(IPC.licensing.saveLocal, { licenseData, key }) as
        | { ok: true }
        | { ok: false; error: string },
    readLocalLicense: () =>
      (
        ipcRenderer.sendSync(IPC.licensing.readLocal) as {
          ok: true;
          data: {
            status: string;
            tier: string | null;
            expiresAt: string | null;
            customer: {
              id: string | null;
              name: string | null;
              email: string | null;
            } | null;
            activationId: string | null;
            licenseKeyId: string | null;
            activatedAt: string;
            licenseKeyFingerprint: string;
          } | null;
        }
      ).data,
  },
  onboarding: {
    checkAndBootstrapDatabase: () =>
      ipcRenderer.invoke(IPC.onboarding.checkAndBootstrapDatabase) as Promise<
        | {
            ok: true;
            data: {
              ok: boolean;
              clusterPath: string;
              wasFreshInstall: boolean;
              message: string;
            };
          }
        | { ok: false; error: string }
      >,
    verifyNetworkPort: (port?: number) =>
      ipcRenderer.invoke(IPC.onboarding.verifyNetworkPort, { port }) as Promise<
        | {
            ok: true;
            data: { available: boolean; port: number; message: string };
          }
        | { ok: false; error: string }
      >,
  },
  migration: {
    getStatus: () =>
      ipcRenderer.invoke(IPC.migration.getStatus) as Promise<
        | { ok: true; data: unknown }
        | { ok: false; error: string }
      >,
    importSnapshot: (payload: unknown) =>
      ipcRenderer.invoke(IPC.migration.importSnapshot, payload) as Promise<
        | { ok: true; data: unknown }
        | { ok: false; error: string }
      >,
  },
  operations: {
    inventory: {
      list: () => ipcRenderer.invoke(IPC.operations.inventory.list, withAuth()),
      listMovements: (sku?: string) =>
        ipcRenderer.invoke(IPC.operations.inventory.listMovements, withAuth({ sku })),
      findByScan: (code: string) =>
        ipcRenderer.invoke(IPC.operations.inventory.findByScan, withAuth({ code })),
      create: (input: unknown) =>
        ipcRenderer.invoke(IPC.operations.inventory.create, withAuth({ input })),
      update: (id: string, patch: unknown) =>
        ipcRenderer.invoke(IPC.operations.inventory.update, withAuth({ id, patch })),
      delete: (id: string) =>
        ipcRenderer.invoke(IPC.operations.inventory.delete, withAuth({ id })),
      adjustStock: (payload: {
        sku: string;
        qty: number;
        type: string;
        reason: string;
      }) => ipcRenderer.invoke(IPC.operations.inventory.adjustStock, withAuth(payload)),
      applyWeightedCosts: (allocations: unknown, reason: string) =>
        ipcRenderer.invoke(
          IPC.operations.inventory.applyWeightedCosts,
          withAuth({ allocations, reason }),
        ),
      valuation: () => ipcRenderer.invoke(IPC.operations.inventory.valuation, withAuth()),
    },
    location: {
      list: (includeArchived?: boolean) =>
        ipcRenderer.invoke(IPC.operations.location.list, withAuth({ includeArchived })),
      get: (id: string) => ipcRenderer.invoke(IPC.operations.location.get, withAuth({ id })),
      create: (input: unknown) =>
        ipcRenderer.invoke(IPC.operations.location.create, withAuth({ input })),
      update: (id: string, patch: unknown) =>
        ipcRenderer.invoke(IPC.operations.location.update, withAuth({ id, patch })),
      archive: (id: string) =>
        ipcRenderer.invoke(IPC.operations.location.archive, withAuth({ id })),
    },
    manufacturing: {
      getState: () => ipcRenderer.invoke(IPC.operations.manufacturing.getState, withAuth()),
      createBatch: (input: unknown) =>
        ipcRenderer.invoke(IPC.operations.manufacturing.createBatch, withAuth({ input })),
      updateBatchStatus: (batchId: string, status: string) =>
        ipcRenderer.invoke(IPC.operations.manufacturing.updateBatchStatus, withAuth({ batchId, status })),
      updateStageStatus: (batchId: string, stageId: string, status: string) =>
        ipcRenderer.invoke(IPC.operations.manufacturing.updateStageStatus, withAuth({ batchId, stageId, status })),
      recordMaterialUsage: (batchId: string, sku: string, qty: number) =>
        ipcRenderer.invoke(IPC.operations.manufacturing.recordMaterialUsage, withAuth({ batchId, sku, qty })),
      recordLabor: (batchId: string, stageId: string, hours: number, rate?: number) =>
        ipcRenderer.invoke(IPC.operations.manufacturing.recordLabor, withAuth({ batchId, stageId, hours, rate })),
      saveBom: (bom: unknown) =>
        ipcRenderer.invoke(IPC.operations.manufacturing.saveBom, withAuth({ bom })),
      createBomVersion: (productSku: string, lines: unknown, notes?: string, meta?: unknown) =>
        ipcRenderer.invoke(
          IPC.operations.manufacturing.createBomVersion,
          withAuth({ productSku, lines, notes, meta }),
        ),
    },
    purchasing: {
      getState: () => ipcRenderer.invoke(IPC.operations.purchasing.getState, withAuth()),
      createOrder: (order: unknown) =>
        ipcRenderer.invoke(IPC.operations.purchasing.createOrder, withAuth({ order })),
      submit: (id: string) => ipcRenderer.invoke(IPC.operations.purchasing.submit, withAuth({ id })),
      approve: (id: string) => ipcRenderer.invoke(IPC.operations.purchasing.approve, withAuth({ id })),
      deny: (id: string, reason: string) =>
        ipcRenderer.invoke(IPC.operations.purchasing.deny, withAuth({ id, reason })),
      getPoLog: (poId: string) =>
        ipcRenderer.invoke(IPC.operations.purchasing.getPoLog, withAuth({ poId })),
      receive: (id: string, sku: string, qty: number) =>
        ipcRenderer.invoke(IPC.operations.purchasing.receive, withAuth({ id, sku, qty })),
    },
    imports: {
      list: () => ipcRenderer.invoke(IPC.operations.imports.list, withAuth()),
      create: (shipment: unknown) =>
        ipcRenderer.invoke(IPC.operations.imports.create, withAuth({ shipment })),
      update: (id: string, patch: unknown) =>
        ipcRenderer.invoke(IPC.operations.imports.update, withAuth({ id, patch })),
      attachFile: (shipmentId: string, name: string, size: number) =>
        ipcRenderer.invoke(IPC.operations.imports.attachFile, withAuth({ shipmentId, name, size })),
      applyLandedCost: (shipmentId: string) =>
        ipcRenderer.invoke(IPC.operations.imports.applyLandedCost, withAuth({ shipmentId })),
    },
    crm: {
      getState: () => ipcRenderer.invoke(IPC.operations.crm.getState, withAuth()),
      importEntity: (input: unknown) =>
        ipcRenderer.invoke(IPC.operations.crm.importEntity, withAuth({ input })),
      createEntity: (entity: unknown) =>
        ipcRenderer.invoke(IPC.operations.crm.createEntity, withAuth({ entity })),
      updateEntity: (id: string, patch: unknown) =>
        ipcRenderer.invoke(IPC.operations.crm.updateEntity, withAuth({ id, patch })),
      addActivity: (entityId: string, type: string, subject: string, body: string) =>
        ipcRenderer.invoke(IPC.operations.crm.addActivity, withAuth({ entityId, type, subject, body })),
      addReminder: (entityId: string, title: string, dueAt: string) =>
        ipcRenderer.invoke(IPC.operations.crm.addReminder, withAuth({ entityId, title, dueAt })),
      completeReminder: (id: string) =>
        ipcRenderer.invoke(IPC.operations.crm.completeReminder, withAuth({ id })),
    },
    pipeline: {
      getState: () => ipcRenderer.invoke(IPC.operations.pipeline.getState, withAuth()),
      createOpportunity: (opportunity: unknown) =>
        ipcRenderer.invoke(IPC.operations.pipeline.createOpportunity, withAuth({ opportunity })),
      moveStage: (id: string, stage: string) =>
        ipcRenderer.invoke(IPC.operations.pipeline.moveStage, withAuth({ id, stage })),
      createTask: (input: unknown) =>
        ipcRenderer.invoke(IPC.operations.pipeline.createTask, withAuth({ input })),
      completeTask: (id: string) =>
        ipcRenderer.invoke(IPC.operations.pipeline.completeTask, withAuth({ id })),
    },
    sales: {
      getState: () => ipcRenderer.invoke(IPC.operations.sales.getState, withAuth()),
      createQuote: (quote: unknown) =>
        ipcRenderer.invoke(IPC.operations.sales.createQuote, withAuth({ quote })),
      convertQuoteToOrder: (quoteId: string) =>
        ipcRenderer.invoke(IPC.operations.sales.convertQuoteToOrder, withAuth({ quoteId })),
      convertOrderToInvoice: (orderId: string) =>
        ipcRenderer.invoke(IPC.operations.sales.convertOrderToInvoice, withAuth({ orderId })),
    },
    pos: {
      getState: () => ipcRenderer.invoke(IPC.operations.pos.getState, withAuth()),
      saveSale: (sale: unknown) => ipcRenderer.invoke(IPC.operations.pos.saveSale, withAuth({ sale })),
      reverseSale: (saleId: string) =>
        ipcRenderer.invoke(IPC.operations.pos.reverseSale, withAuth({ saleId })),
      flushQueue: () => ipcRenderer.invoke(IPC.operations.pos.flushQueue, withAuth()),
      clearTransactions: () => ipcRenderer.invoke(IPC.operations.pos.clearTransactions, withAuth()),
      getOpsState: () => ipcRenderer.invoke(IPC.operations.pos.getOpsState, withAuth()),
      createOnlineOrder: (input: unknown) =>
        ipcRenderer.invoke(IPC.operations.pos.createOnlineOrder, withAuth({ input })),
      updateOnlineOrderStatus: (id: string, status: string) =>
        ipcRenderer.invoke(IPC.operations.pos.updateOnlineOrderStatus, withAuth({ id, status })),
      recordReturn: (
        saleRef: string,
        lines: unknown,
        reason: string,
        refundMethod: string,
        restocked: boolean,
      ) =>
        ipcRenderer.invoke(
          IPC.operations.pos.recordReturn,
          withAuth({ saleRef, lines, reason, refundMethod, restocked }),
        ),
      recordVoid: (saleRef: string, reason: string, managerPin?: string) =>
        ipcRenderer.invoke(IPC.operations.pos.recordVoid, withAuth({ saleRef, reason, managerPin })),
    },
    loyalty: {
      list: () => ipcRenderer.invoke(IPC.operations.loyalty.list, withAuth()),
      earnPoints: (customerCode: string, points: number, ref: string) =>
        ipcRenderer.invoke(IPC.operations.loyalty.earnPoints, withAuth({ customerCode, points, ref })),
      redeemPoints: (customerCode: string, points: number, ref: string) =>
        ipcRenderer.invoke(IPC.operations.loyalty.redeemPoints, withAuth({ customerCode, points, ref })),
    },
    blindspot: {
      create: (entry: unknown) =>
        ipcRenderer.invoke(IPC.operations.blindspot.create, withAuth({ entry })),
      update: (id: string, patch: unknown) =>
        ipcRenderer.invoke(IPC.operations.blindspot.update, withAuth({ id, patch })),
      getForEntity: (query?: unknown) =>
        ipcRenderer.invoke(IPC.operations.blindspot.getForEntity, withAuth({ query })),
      delete: (id: string) => ipcRenderer.invoke(IPC.operations.blindspot.delete, withAuth({ id })),
      uploadVideo: (entryId: string, sourcePath: string) =>
        ipcRenderer.invoke(IPC.operations.blindspot.uploadVideo, withAuth({ entryId, sourcePath })),
    },
  },
  files: {
    getPathForDroppedFile: (file: File) => webUtils.getPathForFile(file),
  },
  branding: {
    get: () => ipcRenderer.invoke(IPC.branding.get),
    update: (payload: unknown) => ipcRenderer.invoke(IPC.branding.update, payload),
  },
  printHtml: (html: string) =>
    ipcRenderer.invoke(IPC.print.printHtml, { html }) as Promise<{ ok: boolean; error?: string }>,
};

/** Lightweight AI bridge alias requested for renderer integrations. */
const api = {
  sendAiQuery: (prompt: string) =>
    ipcRenderer.invoke(IPC.ai.sendQuery, withAuth({ prompt })) as Promise<
      { ok: true; data: string } | { ok: false; error: string }
    >,
};

contextBridge.exposeInMainWorld("benben", benben);
contextBridge.exposeInMainWorld("api", api);

/** Synchronous desktop shell flags — available before React boot. */
contextBridge.exposeInMainWorld("__BENBEN_DESKTOP_SHELL__", true);
if (isDemoBuild()) {
  contextBridge.exposeInMainWorld("__BENBEN_DEMO_BUILD__", true);
}

export type BenbenApi = typeof benben;
