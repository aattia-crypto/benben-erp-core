/** Renderer-side types mirroring desktop/services/localstorage-migration.types.ts */

export type LocalStorageMigrationSnapshot = {
  exportedAt: string;
  isDemoMode: boolean;
  sourceChecksum: string;
  modules: LocalStorageMigrationModules;
};

export type LocalStorageMigrationModules = {
  inventory?: {
    items: Record<string, unknown>[];
    movements: Record<string, unknown>[];
  };
  locations?: Record<string, unknown>[];
  manufacturing?: Record<string, unknown>;
  purchasing?: Record<string, unknown>;
  sales?: Record<string, unknown>;
  crm?: Record<string, unknown>;
  crmPipeline?: Record<string, unknown>;
  imports?: Record<string, unknown>;
  pos?: { sales: Record<string, unknown>[]; queue: string[] };
  posOps?: Record<string, unknown>;
  posLoyalty?: Record<string, unknown>[];
  dataImportHistory?: Record<string, unknown>[];
  finance?: {
    ar?: Record<string, unknown>;
    ap?: Record<string, unknown>;
    gl?: Record<string, unknown>;
  };
};

export type MigrationStatusDto = {
  migrationKey: string;
  required: boolean;
  completed: boolean;
  status: string | null;
  completedAt: string | null;
  moduleCounts: Record<string, number> | null;
  errorDetail: string | null;
};

export type MigrationImportResult = {
  ok: boolean;
  skipped?: boolean;
  skipReason?: string;
  moduleCounts?: Record<string, number>;
  error?: string;
};
