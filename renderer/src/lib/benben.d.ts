import type { DesktopAuthSessionDto } from "./desktop-types";
import type { UpdateCheckResult } from "./update-service";

export interface BenbenAuthLoginData {
  session: DesktopAuthSessionDto;
}

export interface BenbenAuthApi {
  restoreSessionToken(token: string | null, orgId?: string | null): void;
  getSessionToken(): string | null;
  login(
    username: string,
    password: string,
  ): Promise<
    | { ok: true; data: BenbenAuthLoginData }
    | { ok: false; error: string }
  >;
  logout(): Promise<{ ok: boolean }>;
  getSession(): Promise<
    | { ok: true; data: DesktopAuthSessionDto | null }
    | { ok: false; error: string }
  >;
  initializeAdmin(input: {
    username: string;
    password: string;
    companyName: string;
  }): Promise<
    | { ok: true; data: BenbenAuthLoginData }
    | { ok: false; error: string }
  >;
  provisionUser(input: {
    username: string;
    tempPassword: string;
    displayName: string;
    orgId: string;
    roleId: string;
    permissionsOverride?: Record<string, boolean> | null;
    employeeId?: string | null;
  }): Promise<
    | {
        ok: true;
        data: {
          userId: string;
          username: string;
          name: string;
          orgId: string;
          roleId: string;
        };
      }
    | { ok: false; error: string }
  >;
}

export interface BenbenSystemStatus {
  databasePath: string;
  schemaVersion: number | null;
  financeTablesReady: boolean;
  financeTableNames: string[];
  uiStagedAt: string | null;
  uiEntry: string | null;
  uiHasFinanceRoutes: boolean;
  uiMissingRoutes: string[];
  financeApiUrl: string;
  desktopBuildStamp: string | null;
}

export interface EmailDeliveryResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  attemptedAt: string;
}

export interface BenbenDesktopApi {
  app: {
    getVersion(): Promise<string>;
    getPaths(): Promise<unknown>;
    ping(): Promise<unknown>;
    getDiagnostics(): Promise<unknown>;
  };
  system: {
    getStatus(): Promise<BenbenSystemStatus>;
    listActivityLogs(filters?: {
      module?: string;
      action?: string;
      limit?: number;
    }): Promise<{ ok: boolean; data?: { combined?: unknown[] }; error?: string }>;
  };
  auth: BenbenAuthApi;
  backup: {
    create(): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    list(): Promise<{ ok: boolean; data?: unknown[]; error?: string }>;
    restore(id: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    getHealth(): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    setPolicy(patch: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    verify(id: string): Promise<{ ok: boolean; data?: { ok: boolean; message: string }; error?: string }>;
    runScheduled(): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  };
  email: {
    send(input: unknown): Promise<{ ok: boolean; data?: EmailDeliveryResult; error?: string }>;
    test(payload: unknown): Promise<{ ok: boolean; data?: EmailDeliveryResult; error?: string }>;
    verifyConnection(settings: unknown): Promise<{ ok: boolean; data?: EmailDeliveryResult; error?: string }>;
  };
  update: {
    check(channel: string): Promise<UpdateCheckResult>;
    getStatus(): Promise<
      | {
          ok: true;
          data: {
            schedulerRunning: boolean;
            channel: "stable" | "beta" | "internal";
            lastCheck: UpdateCheckResult | null;
            nextCheckDueAt: string | null;
          };
        }
      | { ok: false; error: string }
    >;
  };
  support: {
    exportBundle(extra?: unknown): Promise<{ ok: boolean; path?: string; error?: string }>;
  };
  dialog: {
    pickFolder(): Promise<{ ok: boolean; data?: string | null; error?: string }>;
    pickFile(
      filters?: { name: string; extensions: string[] }[],
    ): Promise<{ ok: boolean; data?: string | null; error?: string }>;
    validatePath(
      path: string,
    ): Promise<{ ok: boolean; data?: { path: string; writable: boolean; created?: boolean }; error?: string }>;
  };
  hr: {
    getEmployees(): Promise<{ ok: boolean; data?: unknown[]; error?: string }>;
    createEmployee(input: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    getTimecards(): Promise<{ ok: boolean; data?: unknown[]; error?: string }>;
    createTimecard(input: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    approveTimecard(timecardId: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    getPayrollRuns(): Promise<{ ok: boolean; data?: unknown[]; error?: string }>;
    createPayrollRun(input: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  };
  payroll: {
    calculate(payrollRunId: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    finalize(payrollRunId: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    importExternal(input: {
      filePath: string;
      entryDate?: string;
      idempotencyKey?: string;
    }): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  };
  permissions: {
    listRoles(): Promise<{ ok: boolean; data?: unknown[]; error?: string }>;
    updateRole(
      roleId: string,
      permissions: Record<string, boolean>,
    ): Promise<{ ok: boolean; error?: string }>;
    assignUserRole(
      userId: string,
      roleId: string,
      permissionsOverride?: Record<string, boolean> | null,
    ): Promise<{ ok: boolean; error?: string }>;
    getForUser(userId: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    listUsers(): Promise<{ ok: boolean; data?: unknown[]; error?: string }>;
    deactivateUser(userId: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    reactivateUser(userId: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    deleteUser(
      userId: string,
    ): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    resetUserPassword(
      userId: string,
      newPassword: string,
    ): Promise<{ ok: boolean; data?: { user: unknown }; error?: string }>;
  };
  finance: {
    runConsolidation(input: {
      fxRate: number;
      periodYear?: number;
      periodMonth?: number;
      fromCurrency?: string;
      functionalCurrency?: string;
    }): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    calculateTax(input?: {
      taxZoneCode?: string;
      invoiceRef?: string;
      amount?: number;
    }): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    createSampleBudget(fiscalYear?: number): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  };
  ai: {
    sendQuery(prompt: string): Promise<{ ok: true; data: string } | { ok: false; error: string }>;
    getStatus(): Promise<{ ok: true; data: { configured: boolean } } | { ok: false; error: string }>;
    saveApiKey(apiKey: string): Promise<{ ok: true; data: { configured: boolean } } | { ok: false; error: string }>;
  };
  licensing: {
    getStatus(): Promise<
      | {
          ok: true;
          data: {
            allowed: boolean;
            mode: "trial" | "activated" | "expired";
            daysRemaining: number;
            message: string;
            trialStartedAt: string | null;
            activatedAt: string | null;
            seatCount: number;
            machineFingerprint: string;
            activationKeyMasked: string | null;
          };
        }
      | { ok: false; error: string }
    >;
    getMachineFingerprint(): Promise<
      | { ok: true; data: { fingerprint: string } }
      | { ok: false; error: string }
    >;
    activate(
      activationKey: string,
      seatCount?: number,
    ): Promise<
      | { ok: true; data: { allowed: boolean; mode: string; message: string } }
      | { ok: false; error: string }
    >;
    saveLocalLicense(
      licenseData: unknown,
      key: string,
    ): { ok: true } | { ok: false; error: string };
    readLocalLicense(): import("./licenseStorage").LocalLicenseDetails | null;
  };
  onboarding: {
    checkAndBootstrapDatabase(): Promise<
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
    >;
    verifyNetworkPort(port?: number): Promise<
      | {
          ok: true;
          data: { available: boolean; port: number; message: string };
        }
      | { ok: false; error: string }
    >;
  };
  migration: {
    getStatus(): Promise<
      | { ok: true; data: import("./migration-types").MigrationStatusDto }
      | { ok: false; error: string }
    >;
    importSnapshot(
      payload: import("./migration-types").LocalStorageMigrationSnapshot,
    ): Promise<
      | { ok: true; data: import("./migration-types").MigrationImportResult }
      | { ok: false; error: string }
    >;
  };
  operations: {
    inventory: {
      list(): Promise<
        | { ok: true; data: import("./inventory-store").InventoryItem[] }
        | { ok: false; error: string }
      >;
      listMovements(
        sku?: string,
      ): Promise<
        | { ok: true; data: import("./inventory-store").InventoryMovement[] }
        | { ok: false; error: string }
      >;
      findByScan(
        code: string,
      ): Promise<
        | { ok: true; data: import("./inventory-store").InventoryItem | null }
        | { ok: false; error: string }
      >;
      create(
        input: import("./inventory-store").ItemInput,
      ): Promise<
        | { ok: true; data: import("./inventory-store").InventoryItem }
        | { ok: false; error: string }
      >;
      update(
        id: string,
        patch: Partial<import("./inventory-store").ItemInput>,
      ): Promise<
        | { ok: true; data: import("./inventory-store").InventoryItem }
        | { ok: false; error: string }
      >;
      delete(
        id: string,
      ): Promise<{ ok: true; data: { deleted: boolean } } | { ok: false; error: string }>;
      adjustStock(payload: {
        sku: string;
        qty: number;
        type: import("./inventory-store").InventoryMovement["type"];
        reason: string;
      }): Promise<
        | {
            ok: true;
            data: {
              item: import("./inventory-store").InventoryItem | null;
              movement: import("./inventory-store").InventoryMovement;
            };
          }
        | { ok: false; error: string }
      >;
      applyWeightedCosts(
        allocations: { sku: string; landedUnitCost: number }[],
        reason: string,
      ): Promise<
        | { ok: true; data: import("./inventory-store").InventoryItem[] }
        | { ok: false; error: string }
      >;
      valuation(): Promise<
        | { ok: true; data: { total: number } }
        | { ok: false; error: string }
      >;
    };
    location: {
      list(
        includeArchived?: boolean,
      ): Promise<
        | { ok: true; data: import("./location-store").StockLocation[] }
        | { ok: false; error: string }
      >;
      get(
        id: string,
      ): Promise<
        | { ok: true; data: import("./location-store").StockLocation | null }
        | { ok: false; error: string }
      >;
      create(
        input: import("./location-store").LocationInput,
      ): Promise<
        | { ok: true; data: import("./location-store").StockLocation }
        | { ok: false; error: string }
      >;
      update(
        id: string,
        patch: Partial<import("./location-store").LocationInput & { active: boolean }>,
      ): Promise<
        | { ok: true; data: import("./location-store").StockLocation }
        | { ok: false; error: string }
      >;
      archive(
        id: string,
      ): Promise<
        | { ok: true; data: import("./location-store").StockLocation }
        | { ok: false; error: string }
      >;
    };
    manufacturing: Record<string, (...args: never[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>>;
    purchasing: Record<string, (...args: never[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>>;
    imports: Record<string, (...args: never[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>>;
    crm: Record<string, (...args: never[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>>;
    pipeline: Record<string, (...args: never[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>>;
    sales: Record<string, (...args: never[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>>;
    pos: Record<string, (...args: never[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>>;
    loyalty: Record<string, (...args: never[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>>;
  };
  branding: {
    get(): Promise<
      | { ok: true; data: import("./branding-types").BrandingDto }
      | { ok: false; error: string }
    >;
    update(
      payload: import("./branding-types").BrandingUpdatePayload,
    ): Promise<
      | { ok: true; data: import("./branding-types").BrandingDto }
      | { ok: false; error: string }
    >;
  };
  /** Main-process print bridge — loads HTML in a hidden window and opens the OS print dialog. */
  printHtml(html: string): Promise<{ ok: boolean; error?: string }>;
}

export interface BenbenAiApi {
  sendAiQuery(prompt: string): Promise<{ ok: true; data: string } | { ok: false; error: string }>;
}

declare global {
  interface Window {
    benben?: BenbenDesktopApi;
    /** AI agentry bridge (main-process IPC). */
    api?: BenbenAiApi;
    /** Injected by main process for Presenter / Evaluation demo executables. */
    __BENBEN_DEMO_BUILD__?: boolean;
    /** Injected by preload/main — native Electron shell (not browser-only dev UI). */
    __BENBEN_DESKTOP_SHELL__?: boolean;
    __BENBEN_FINANCE_API__?: string;
    __BENBEN_LICENSE_NOTICE__?: string;
  }
}

export {};
