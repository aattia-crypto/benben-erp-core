import fs from "node:fs";
import path from "node:path";

import { getPostgresDataDir } from "./postgres-lifecycle.service";
import { logger } from "../utils/logger";

export type DbIntegrityResult = {
  ok: boolean;
  message: string;
  path: string;
  sizeBytes: number;
};

/** Lightweight PGDATA check — does not open Prisma. */
export function checkDatabaseIntegrity(): DbIntegrityResult {
  const dataDir = getPostgresDataDir();
  const versionFile = path.join(dataDir, "PG_VERSION");

  if (!fs.existsSync(dataDir)) {
    return {
      ok: true,
      message: "PostgreSQL data directory will be created on first run.",
      path: dataDir,
      sizeBytes: 0,
    };
  }

  if (!fs.existsSync(versionFile)) {
    return {
      ok: true,
      message: "PostgreSQL cluster not initialized yet (expected on first launch).",
      path: dataDir,
      sizeBytes: 0,
    };
  }

  const version = fs.readFileSync(versionFile, "utf8").trim();
  let sizeBytes = 0;
  try {
    sizeBytes = dirSize(dataDir);
  } catch (err) {
    logger.warn("Could not measure PGDATA size", err);
  }

  if (sizeBytes > 0 && sizeBytes < 4096) {
    return {
      ok: false,
      message: "PostgreSQL data directory appears truncated or corrupted.",
      path: dataDir,
      sizeBytes,
    };
  }

  return {
    ok: true,
    message: `PostgreSQL cluster present (server version ${version}).`,
    path: dataDir,
    sizeBytes,
  };
}

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else total += fs.statSync(full).size;
  }
  return total;
}
