import fs from "node:fs";
import path from "node:path";

import { getPrisma } from "./database";
import { getFinanceApiBaseUrl } from "../server/finance-api-server";
import { getRendererDistDir } from "../utils/ui-paths";
import { getDatabasePath } from "../utils/paths";

const REQUIRED_UI_ROUTES = ["/ar", "/ap", "/sales-invoicing", "/accounting"] as const;

export type SystemStatus = {
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
};

function readRendererFingerprint(): {
  stagedAt: string | null;
  entry: string | null;
} {
  const fpPath = path.join(getRendererDistDir(), ".stage-fingerprint.json");
  if (!fs.existsSync(fpPath)) {
    return { stagedAt: null, entry: null };
  }
  try {
    const fp = JSON.parse(fs.readFileSync(fpPath, "utf8")) as {
      stagedAt?: string;
      entry?: string;
    };
    return { stagedAt: fp.stagedAt ?? null, entry: fp.entry ?? null };
  } catch {
    return { stagedAt: null, entry: null };
  }
}

function readUiRouteCoverage(): { ok: boolean; missing: string[] } {
  const indexPath = path.join(getRendererDistDir(), "index.html");
  if (!fs.existsSync(indexPath)) {
    return { ok: false, missing: [...REQUIRED_UI_ROUTES] };
  }
  const html = fs.readFileSync(indexPath, "utf8");
  const missing = REQUIRED_UI_ROUTES.filter((r) => !html.includes(`"${r}"`));
  return { ok: missing.length === 0, missing };
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const db = getPrisma();
  const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
  const tables = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('GlAccount', 'BankStatement', 'FixedAsset', 'BudgetPlan', 'TaxZone')
  `;
  const financeTableNames = tables.map((t) => t.table_name);
  const fingerprint = readRendererFingerprint();
  const routeCoverage = readUiRouteCoverage();

  const stampPath = path.join(__dirname, "build-stamp.json");
  let desktopBuildStamp: string | null = null;
  if (fs.existsSync(stampPath)) {
    try {
      desktopBuildStamp = (JSON.parse(fs.readFileSync(stampPath, "utf8")) as { builtAt: string })
        .builtAt;
    } catch {
      desktopBuildStamp = null;
    }
  }

  return {
    databasePath: getDatabasePath(),
    schemaVersion: meta?.schemaVersion ?? null,
    financeTablesReady: financeTableNames.includes("GlAccount"),
    financeTableNames,
    uiStagedAt: fingerprint.stagedAt,
    uiEntry: fingerprint.entry,
    uiHasFinanceRoutes: routeCoverage.ok,
    uiMissingRoutes: routeCoverage.missing,
    financeApiUrl: getFinanceApiBaseUrl(),
    desktopBuildStamp,
  };
}

export type ExtendedHealth = SystemStatus & {
  prismaConnected: boolean;
  arApTablesReady: boolean;
  financeApiReachable: boolean;
  migrationTableCount: number;
  lastActivityAt: string | null;
  overall: "green" | "yellow" | "red";
};

export async function getExtendedSystemHealth(): Promise<ExtendedHealth> {
  const base = await getSystemStatus();
  const db = getPrisma();
  let prismaConnected = false;
  let arApTablesReady = false;
  let migrationTableCount = 0;
  let lastActivityAt: string | null = null;

  try {
    await db.$queryRaw`SELECT 1`;
    prismaConnected = true;
    const tables = await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    migrationTableCount = tables.length;
    const names = new Set(tables.map((t) => t.table_name));
    arApTablesReady = names.has("ArInvoice") && names.has("ApBill");
    const last = await db.activityLog.findFirst({ orderBy: { createdAt: "desc" } });
    lastActivityAt = last?.createdAt.toISOString() ?? null;
  } catch {
    prismaConnected = false;
  }

  let financeApiReachable = false;
  try {
    const res = await fetch(`${base.financeApiUrl}/api/finance/health`);
    financeApiReachable = res.ok;
  } catch {
    financeApiReachable = false;
  }

  let overall: ExtendedHealth["overall"] = "green";
  if (!prismaConnected || !base.financeTablesReady) overall = "red";
  else if (!arApTablesReady || !financeApiReachable || !base.uiHasFinanceRoutes) overall = "yellow";

  return {
    ...base,
    prismaConnected,
    arApTablesReady,
    financeApiReachable,
    migrationTableCount,
    lastActivityAt,
    overall,
  };
}

export function assertFinanceUiRoutes(): void {
  const { ok, missing } = readUiRouteCoverage();
  if (!ok) {
    throw new Error(
      `Packaged UI is missing Finance routes (${missing.join(", ")}). ` +
        `From the repo root run: npm run build`,
    );
  }
}
