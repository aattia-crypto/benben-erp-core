import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  assertPrismaPackagedAssets,
  configurePackagedQueryEngine,
  getPrismaCliPath,
  getPrismaRuntimeRoot,
  getPrismaSchemaEnginePath,
  getPrismaSchemaPath,
  resolvePackagedQueryEngine,
} from "../utils/prisma-paths";
import { getDatabaseUrl } from "../utils/paths";
import { logger } from "../utils/logger";
import { runMigrationsSafe } from "./migration.service";
import {
  assertEmbeddedPostgresQueryable,
  getEmbeddedDatabaseUrl,
  getPostgresDataDir,
  startEmbeddedPostgres,
  stopEmbeddedPostgres,
} from "./postgres-lifecycle.service";
import { runSystemSeed } from "./database-seed.service";

let prisma: PrismaClient | undefined;

const MAX_CONNECT_ATTEMPTS = 30;
const CONNECT_RETRY_DELAY_MS = 1000;
const DB_PUSH_MAX_ATTEMPTS = 5;
const DB_PUSH_RETRY_DELAY_MS = 5000;

/** Wait for embedded PostgreSQL to accept Prisma TCP connections (socket may lag behind process spawn). */
async function connectWithRetry(client: PrismaClient): Promise<void> {
  let attempts = 0;
  let lastError: unknown;

  while (attempts < MAX_CONNECT_ATTEMPTS) {
    attempts++;
    try {
      await client.$connect();
      if (attempts > 1) {
        logger.info("Database connection established after retry", { attempts });
      } else {
        logger.info("Successfully established secure socket connection to local PostgreSQL process.");
      }
      return;
    } catch (error) {
      lastError = error;
      await client.$disconnect().catch(() => undefined);
      logger.warn("Database socket binding in progress", {
        attempt: attempts,
        maxAttempts: MAX_CONNECT_ATTEMPTS,
        message: error instanceof Error ? error.message : String(error),
      });
      if (attempts >= MAX_CONNECT_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAY_MS));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Can't reach database server"));
}

/** Inject active PostgreSQL URL from embedded subprocess (must run after startEmbeddedPostgres). */
export function setDatabaseEnv(): void {
  const existing = process.env.DATABASE_URL?.trim();
  if (existing?.startsWith("postgresql://")) {
    return;
  }
  const url = getEmbeddedDatabaseUrl();
  if (!url.startsWith("postgresql://")) {
    throw new Error(`DATABASE_URL must be PostgreSQL; got ${url.split(":")[0] ?? "unknown"}://`);
  }
  process.env.DATABASE_URL = url;
}

/**
 * Runtime connection string from postgres-runtime.json / embedded PG lifecycle — not a static .env file.
 * Call only after {@link startEmbeddedPostgres} (or equivalent DATABASE_URL injection).
 * Honors a pre-set DATABASE_URL for force-seed / tooling.
 */
export function resolveRuntimeDatabaseUrl(): string {
  setDatabaseEnv();
  return getDatabaseUrl();
}

/** Singleton Prisma client — datasource URL bound at runtime from embedded PostgreSQL credentials. */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    const dynamicRuntimeUrl = resolveRuntimeDatabaseUrl();
    configurePackagedQueryEngine();
    prisma = new PrismaClient({
      datasources: {
        db: { url: dynamicRuntimeUrl },
      },
    });
  }
  return prisma;
}

export async function connectDatabase(): Promise<void> {
  const client = getPrisma();
  await connectWithRetry(client);
  const safeUrl = getDatabaseUrl().replace(/:([^:@/]+)@/, ":***@");
  logger.info("Database connected", { url: safeUrl });
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
    logger.info("Database disconnected");
  }
  await stopEmbeddedPostgres();
}

/** Drop Prisma pool only — embedded PostgreSQL keeps running for pg_restore. */
export async function suspendDatabaseForRestore(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
    logger.info("Prisma disconnected for restore maintenance");
  }
}

/** Re-open Prisma pool after pg_restore completes. Postgres must already be running. */
export async function resumeDatabaseAfterRestore(): Promise<void> {
  setDatabaseEnv();
  await connectDatabase();
  await assertSchemaReady();
  logger.info("Database reconnected after restore");
}

function runPrismaCli(args: string[]): string {
  const runtimeRoot = getPrismaRuntimeRoot();
  const prismaCli = getPrismaCliPath();
  const schemaPath = getPrismaSchemaPath();
  const databaseUrl = getDatabaseUrl();

  if (!fs.existsSync(prismaCli)) {
    throw new Error(`Prisma CLI missing: ${prismaCli}`);
  }
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Prisma schema missing: ${schemaPath}`);
  }

  configurePackagedQueryEngine();

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    DATABASE_URL: databaseUrl,
  };

  const queryEngine = resolvePackagedQueryEngine();
  if (queryEngine) {
    childEnv.PRISMA_QUERY_ENGINE_LIBRARY = queryEngine;
  }
  const schemaEngine = getPrismaSchemaEnginePath();
  if (schemaEngine) {
    childEnv.PRISMA_SCHEMA_ENGINE_BINARY = schemaEngine;
  }

  return execFileSync(process.execPath, [prismaCli, ...args, "--schema", schemaPath], {
    cwd: path.join(runtimeRoot, "prisma"),
    env: childEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
}

/**
 * Map Prisma schema to the live embedded database (blank cluster on first boot).
 * Equivalent to `prisma db push` against process.env.DATABASE_URL.
 */
export async function pushDatabaseSchema(): Promise<void> {
  setDatabaseEnv();
  logger.info("Pushing database schema (prisma db push)", {
    schemaPath: getPrismaSchemaPath(),
    database: getDatabaseUrl().replace(/:([^:@/]+)@/, ":***@"),
  });

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= DB_PUSH_MAX_ATTEMPTS; attempt++) {
    await assertEmbeddedPostgresQueryable(
      attempt === 1 ? "pre-db-push" : `pre-db-push-retry-${attempt}`,
    );

    try {
      const output = runPrismaCli(["db", "push", "--skip-generate", "--accept-data-loss"]);
      if (output.trim()) {
        logger.info("db push output", { output: output.trim().slice(-2000) });
      }
      logger.info("Database schema push complete", { attempt });
      return;
    } catch (err) {
      const execErr = err as { stderr?: string; stdout?: string; message?: string };
      const message = execErr.stderr?.trim() || execErr.message || "Prisma db push failed";
      lastError = new Error(message);
      logger.error("db push failed", {
        attempt,
        maxAttempts: DB_PUSH_MAX_ATTEMPTS,
        message: execErr.message,
        stderr: execErr.stderr?.trim(),
        stdout: execErr.stdout?.trim(),
      });
      if (attempt < DB_PUSH_MAX_ATTEMPTS) {
        logger.warn("Retrying prisma db push after embedded PostgreSQL warm-up pause", {
          nextAttempt: attempt + 1,
          delayMs: DB_PUSH_RETRY_DELAY_MS,
        });
        await new Promise((resolve) => setTimeout(resolve, DB_PUSH_RETRY_DELAY_MS));
      }
    }
  }

  throw lastError ?? new Error("Prisma db push failed");
}

/** Optional CLI/dev path: apply versioned migration snapshot (postgresql baseline only). */
export function deployDatabaseMigrations(): void {
  setDatabaseEnv();
  const migrationsDir = path.join(getPrismaRuntimeRoot(), "prisma", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Prisma migrations missing: ${migrationsDir}`);
  }

  logger.info("Running prisma migrate deploy", { migrationsDir });
  try {
    const output = runPrismaCli(["migrate", "deploy"]);
    if (output.trim()) {
      logger.info("migrate deploy output", { output: output.trim().slice(-2000) });
    }
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; message?: string };
    throw new Error(execErr.stderr?.trim() || execErr.message || "Prisma migrate deploy failed");
  }
}

/** Confirm core tables exist after schema push (guards empty/partial databases). */
export async function assertSchemaReady(): Promise<void> {
  const db = getPrisma();
  const tables = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('User', 'AppMeta', 'GlAccount', 'ArInvoice', 'ApBill', 'OrgRole', 'ActivityLog', 'InventoryItem', 'StockLocation')
  `;
  const names = new Set(tables.map((t) => t.table_name));
  if (!names.has("User") || !names.has("AppMeta")) {
    throw new Error(
      `Database schema incomplete after push (found: ${[...names].join(", ") || "none"}).`,
    );
  }
  if (!names.has("GlAccount")) {
    throw new Error("Finance GL tables missing after schema push.");
  }
  if (!names.has("InventoryItem")) {
    throw new Error("Operations inventory tables missing after schema push.");
  }
  if (!names.has("OrgRole")) {
    throw new Error("OrgRole table missing — seed cannot run.");
  }
}

export async function ensureAppMeta(): Promise<void> {
  const db = getPrisma();
  await db.appMeta.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", schemaVersion: 1 },
    update: {},
  });
}

/**
 * Boot: embedded PG → DATABASE_URL → db push → connect → seed → verify.
 * No SQLite files or dialect are used on this path.
 */
export async function bootstrapDatabase(): Promise<void> {
  await startEmbeddedPostgres();
  setDatabaseEnv();

  const schemaResult = await runMigrationsSafe(() => pushDatabaseSchema());
  if (!schemaResult.success) {
    throw new Error(schemaResult.error ?? "Database schema push failed");
  }

  await connectDatabase();
  await assertSchemaReady();
  await runSystemSeed();
}

export type DatabaseBootstrapReport = {
  ok: boolean;
  clusterPath: string;
  wasFreshInstall: boolean;
  message: string;
};

/** True when PGDATA exists and initdb has completed (PG_VERSION present). */
export function isPostgresDataDirectoryReady(): boolean {
  const dataDir = getPostgresDataDir();
  if (!fs.existsSync(dataDir)) return false;
  return fs.existsSync(path.join(dataDir, "PG_VERSION"));
}

/**
 * Onboarding gate — ensure embedded PostgreSQL is initialized and schema/seed are applied.
 * Safe to call when the cluster already exists (idempotent warm-up path).
 */
export async function checkAndBootstrapDatabase(): Promise<DatabaseBootstrapReport> {
  const clusterPath = getPostgresDataDir();
  const wasFreshInstall = !isPostgresDataDirectoryReady();

  if (wasFreshInstall) {
    logger.info("Embedded PostgreSQL cluster missing or empty — running onboarding bootstrap", {
      clusterPath,
    });
  }

  try {
    await bootstrapDatabase();
    return {
      ok: true,
      clusterPath,
      wasFreshInstall,
      message: wasFreshInstall
        ? "Initialized localized database infrastructure."
        : "Localized database is ready.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Onboarding database bootstrap failed", { message, clusterPath });
    return {
      ok: false,
      clusterPath,
      wasFreshInstall,
      message,
    };
  }
}

/** Validates packaged Prisma assets (for smoke tests). */
export function verifyPrismaRuntimeAssets(): void {
  assertPrismaPackagedAssets();
  configurePackagedQueryEngine();
  const engine = process.env.PRISMA_QUERY_ENGINE_LIBRARY;
  logger.info("Prisma runtime assets OK", {
    runtimeRoot: getPrismaRuntimeRoot(),
    schemaPath: getPrismaSchemaPath(),
    queryEngine: engine ?? "(default)",
    dialect: "postgresql",
  });
}
