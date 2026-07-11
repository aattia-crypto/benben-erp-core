/**
 * Phase 1 verification — run with Electron as Node:
 *   npx electron desktop/scripts/verify-phase1.mjs
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadDist(modulePath) {
  return require(path.join(root, "dist-desktop", modulePath));
}

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`[PASS] ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
}

app.whenReady().then(async () => {
  try {
    const { ensureAppDataDirs, getPathsSnapshot, getDatabasePath, getDatabaseUrl } =
      loadDist("utils/paths");
    const { bootstrapDatabase, getPrisma, disconnectDatabase } = loadDist("services/database");
    const { getPostgresDataDir } = loadDist("services/postgres-lifecycle.service");
    const { registerAllIpcHandlers } = loadDist("ipc/index");

    ensureAppDataDirs();
    const paths = getPathsSnapshot();
    for (const [key, value] of Object.entries(paths)) {
      if (!fs.existsSync(value) && key !== "database" && key !== "config") {
        fail(`AppData path exists: ${key}`, value);
      } else {
        pass(`AppData path: ${key}`, value);
      }
    }

    if (!paths.root.toLowerCase().includes("benben")) {
      fail("AppData root naming", paths.root);
    } else {
      pass("AppData root naming", paths.root);
    }

    await bootstrapDatabase();
    const dbUrl = getDatabaseUrl();
    if (dbUrl.startsWith("postgresql://")) pass("DATABASE_URL (PostgreSQL)", dbUrl.replace(/:([^:@/]+)@/, ":***@"));
    else fail("DATABASE_URL dialect", dbUrl);

    const prisma = getPrisma();
    const meta = await prisma.appMeta.findUnique({ where: { id: "singleton" } });
    if (meta) pass("PostgreSQL AppMeta row", `schemaVersion=${meta.schemaVersion}`);
    else fail("PostgreSQL AppMeta row", "missing");

    const roles = await prisma.orgRole.count();
    if (roles >= 5) pass("OrgRole seed", `${roles} roles`);
    else fail("OrgRole seed", `expected roles, found ${roles}`);

    const pgData = getPostgresDataDir();
    if (fs.existsSync(path.join(pgData, "PG_VERSION"))) pass("Embedded PGDATA", pgData);
    else fail("Embedded PGDATA", pgData);

    registerAllIpcHandlers();
    pass("IPC handlers registered");

    const preloadPath = path.join(root, "dist-desktop", "preload.js");
    if (fs.existsSync(preloadPath)) pass("preload.js compiled", preloadPath);
    else fail("preload.js compiled", "missing");

    await disconnectDatabase();
  } catch (err) {
    fail("verification exception", err instanceof Error ? err.message : String(err));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} checks passed ---`);
  setImmediate(() => app.exit(failed.length > 0 ? 1 : 0));
});
