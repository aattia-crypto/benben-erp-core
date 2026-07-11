/**
 * Embedded PostgreSQL subprocess orchestration — zero external DB install for end users.
 * Initializes an isolated cluster under AppData/.benben-db/, listens on all interfaces
 * for same-subnet LAN clients (pg_hba restricts private CIDRs), and tears down on exit.
 */
import { app } from "electron";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as delayMs } from "node:timers/promises";

import { resolveAppDataRoot } from "../utils/platform";
import { logger } from "../utils/logger";

const CONFIG_VERSION = 1;
/** Persisted bind/advertise host — server listens on all interfaces (see postgresql.conf). */
export const POSTGRES_RUNTIME_BIND_HOST = "0.0.0.0" as const;
/** Legacy loopback hostname alias — upgraded to {@link POSTGRES_RUNTIME_BIND_HOST} on save. */
export const POSTGRES_LEGACY_LOOPBACK_HOST = "127.0.0.1" as const;
/** Outbound client target when only a loopback alias was configured. */
export const POSTGRES_CLIENT_CONNECT_HOST = POSTGRES_LEGACY_LOOPBACK_HOST;
const POSTGRES_LOCALHOST_ALIAS = "localhost" as const;

function isLegacyLoopbackHost(host: string): boolean {
  return host === POSTGRES_LEGACY_LOOPBACK_HOST || host === POSTGRES_LOCALHOST_ALIAS;
}

/** Bind/wildcard hosts that cannot be used as TCP client destinations (Windows error 10049). */
function isUnusableOutboundConnectHost(host: string | undefined): boolean {
  const trimmed = host?.trim() ?? "";
  if (!trimmed) return true;
  const h = trimmed.toLowerCase();
  if (h === POSTGRES_RUNTIME_BIND_HOST || h === "0.0.0.0") return true;
  if (h === "*" || h === "::" || h === "::0" || h === "0:0:0:0:0:0:0:0") return true;
  return isLegacyLoopbackHost(trimmed);
}

/** Rewrite psql -h/--host when a bind address was passed instead of a connect target. */
function sanitizePsqlCliArgs(args: string[]): string[] {
  const out = [...args];
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i] !== "-h" && out[i] !== "--host") continue;
    const candidate = out[i + 1];
    if (isUnusableOutboundConnectHost(candidate)) {
      out[i + 1] = POSTGRES_CLIENT_CONNECT_HOST;
    }
  }
  return out;
}
const DEFAULT_PORT = 5433;
const DB_SUPERUSER = "benben";
const DB_NAME = "benben";
const STARTUP_TIMEOUT_MS = 300_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;
const MAX_PSQL_ATTEMPTS = 10;
const PSQL_RETRY_DELAY_MS = 1500;
const POSTGRES_QUERY_READY_TIMEOUT_MS = 300_000;

/** Promise-based execFile — ensures options (env, encoding) are applied and errors carry stderr. */
function execFileAsync(
  file: string,
  args: string[],
  options?: {
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
    timeout?: number;
    windowsHide?: boolean;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        encoding: "utf8",
        maxBuffer: options?.maxBuffer ?? 8 * 1024 * 1024,
        timeout: options?.timeout,
        windowsHide: options?.windowsHide ?? true,
        env: options?.env ?? process.env,
      },
      (err, stdout, stderr) => {
        if (err) {
          const failure = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
          if (stderr) failure.stderr = stderr;
          if (stdout) failure.stdout = stdout;
          reject(failure);
          return;
        }
        resolve(typeof stdout === "string" ? stdout : String(stdout ?? ""));
      },
    );
  });
}

/** Strict chronological pause between psql pre-flight attempts. */
async function sleepBetweenPsqlAttempts(attempt: number, label: string): Promise<void> {
  const waitStartedAt = Date.now();
  logger.info(
    `psql pre-flight (${label}): pausing ${PSQL_RETRY_DELAY_MS}ms before attempt ${attempt}/${MAX_PSQL_ATTEMPTS}`,
    { waitStartedAt: new Date(waitStartedAt).toISOString() },
  );
  await delayMs(PSQL_RETRY_DELAY_MS);
  const elapsed = Date.now() - waitStartedAt;
  logger.info(`psql pre-flight (${label}): pause complete (${elapsed}ms elapsed)`, { attempt });
}

export type PostgresRuntimeConfig = {
  version: typeof CONFIG_VERSION;
  /** Bind/listen advertisement (0.0.0.0 = all adapters). Use {@link resolvePostgresConnectHost} for clients. */
  host: typeof POSTGRES_RUNTIME_BIND_HOST | typeof POSTGRES_CLIENT_CONNECT_HOST | string;
  port: number;
  database: string;
  user: string;
  password: string;
  dataDir: string;
  createdAt: string;
};

let postgresProcess: ChildProcess | null = null;
let runtimeConfig: PostgresRuntimeConfig | null = null;
let databaseUrl: string | null = null;
let shutdownHooksRegistered = false;
let stopping = false;
/** True when initdb ran in this process — credentials on disk match the live cluster. */
let clusterInitializedThisSession = false;

/** AppData/.benben-db/ — isolated PostgreSQL data directory (PGDATA). */
export function getPostgresDataDir(): string {
  return path.join(resolveAppDataRoot(), ".benben-db");
}

/** Credentials live outside PGDATA so wiping .benben-db cannot leave a stale password file behind. */
export function getPostgresConfigPath(): string {
  return path.join(resolveAppDataRoot(), "postgres-runtime.json");
}

function getLegacyRuntimeConfigPath(): string {
  return path.join(getPostgresDataDir(), "runtime.json");
}

function removeRuntimeConfigFile(): void {
  for (const p of [getPostgresConfigPath(), getLegacyRuntimeConfigPath()]) {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      logger.info("Removed stale PostgreSQL runtime config", { path: p });
    }
  }
}

/**
 * Directory containing initdb.exe / postgres.exe (never inside app.asar).
 * Packaged: process.resourcesPath/postgres/win-x64/bin (electron-builder extraResources).
 */
export function getPostgresBinDirectory(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "postgres", "win-x64", "bin");
  }

  const fromCwd = path.join(process.cwd(), "resources", "postgres", "win-x64", "bin");
  if (fs.existsSync(fromCwd)) return fromCwd;

  const fromRepo = path.resolve(__dirname, "..", "..", "resources", "postgres", "win-x64", "bin");
  if (fs.existsSync(fromRepo)) return fromRepo;

  return fromCwd;
}

/** PG distribution root (parent of bin/) — share/, lib/, etc. */
export function getPackagedPostgresRoot(): string {
  return path.join(getPostgresBinDirectory(), "..");
}

function binName(tool: string): string {
  return process.platform === "win32" ? `${tool}.exe` : tool;
}

/** Resolve initdb / postgres / pg_ctl / psql / pg_isready / pg_dump. */
export function resolvePostgresBinary(tool: string): string {
  const overrideDir =
    process.env.BENBEN_POSTGRES_BIN_DIR?.trim() ||
    process.env.NEXUSCORE_POSTGRES_BIN_DIR?.trim();
  if (overrideDir) {
    const direct = path.join(overrideDir, binName(tool));
    if (fs.existsSync(direct)) return direct;
  }

  const packaged = path.join(getPostgresBinDirectory(), binName(tool));
  if (fs.existsSync(packaged)) return packaged;

  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const pgRoot = path.join(programFiles, "PostgreSQL");
    if (fs.existsSync(pgRoot)) {
      const versions = fs
        .readdirSync(pgRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
        .reverse();
      for (const ver of versions) {
        const candidate = path.join(pgRoot, ver, "bin", binName(tool));
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  return packaged;
}

function generatePassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function loadRuntimeConfig(): PostgresRuntimeConfig | null {
  const configPath = getPostgresConfigPath();
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as PostgresRuntimeConfig;
    if (raw.version !== CONFIG_VERSION || !raw.password || !raw.port) return null;
    return {
      ...raw,
      dataDir: raw.dataDir || getPostgresDataDir(),
      host: normalizeRuntimeBindHost(raw.host),
    };
  } catch {
    return null;
  }
}

function saveRuntimeConfig(cfg: PostgresRuntimeConfig): void {
  const normalized: PostgresRuntimeConfig = {
    ...cfg,
    host: normalizeRuntimeBindHost(cfg.host),
  };
  fs.mkdirSync(resolveAppDataRoot(), { recursive: true });
  fs.writeFileSync(getPostgresConfigPath(), JSON.stringify(normalized, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  runtimeConfig = normalized;
}

/** Read legacy runtime.json that used to live inside PGDATA (pre–Prompt 16). */
function loadLegacyRuntimeConfig(): PostgresRuntimeConfig | null {
  const legacyPath = getLegacyRuntimeConfigPath();
  if (!fs.existsSync(legacyPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(legacyPath, "utf8")) as PostgresRuntimeConfig;
    if (raw.version !== CONFIG_VERSION || !raw.password || !raw.port) return null;
    return {
      ...raw,
      dataDir: getPostgresDataDir(),
      host: normalizeRuntimeBindHost(raw.host),
    };
  } catch {
    return null;
  }
}

/** Normalize persisted host to the LAN bind address written to postgres-runtime.json. */
export function normalizeRuntimeBindHost(host: string | undefined): typeof POSTGRES_RUNTIME_BIND_HOST {
  const h = host?.trim();
  if (!h || isLegacyLoopbackHost(h) || h === "*") {
    return POSTGRES_RUNTIME_BIND_HOST;
  }
  if (h === POSTGRES_RUNTIME_BIND_HOST) {
    return POSTGRES_RUNTIME_BIND_HOST;
  }
  return h as typeof POSTGRES_RUNTIME_BIND_HOST;
}

/**
 * Host for outbound DB clients (Prisma, psql, pg_dump).
 * Bind address 0.0.0.0 / * cannot be used as a connect target on Windows (WSAEADDRNOTAVAIL 10049);
 * local processes use loopback while postgres-runtime.json keeps 0.0.0.0 for LAN discovery.
 */
export function resolvePostgresConnectHost(cfg: PostgresRuntimeConfig): string {
  const h = cfg.host?.trim() ?? POSTGRES_RUNTIME_BIND_HOST;
  if (isUnusableOutboundConnectHost(h)) {
    return POSTGRES_CLIENT_CONNECT_HOST;
  }
  return h;
}

async function createFreshRuntimeConfig(): Promise<PostgresRuntimeConfig> {
  const dataDir = getPostgresDataDir();
  const port = await pickListenPort(DEFAULT_PORT);
  const password = generatePassword();
  const cfg: PostgresRuntimeConfig = {
    version: CONFIG_VERSION,
    host: "0.0.0.0",
    port,
    database: DB_NAME,
    user: DB_SUPERUSER,
    password,
    dataDir,
    createdAt: new Date().toISOString(),
  };
  saveRuntimeConfig(cfg);
  logger.info("Fresh PostgreSQL runtime credentials written (single source of truth)", {
    configPath: getPostgresConfigPath(),
    dataDir,
    port,
  });
  return cfg;
}

/**
 * Keep PGDATA and postgres-runtime.json in lockstep.
 * Fresh/wiped cluster → purge config, new password, initdb in one atomic boot step.
 */
async function reconcileClusterAndRuntime(): Promise<PostgresRuntimeConfig> {
  const dataDir = getPostgresDataDir();
  const clusterReady = isClusterInitialized(dataDir);
  const dataDirExists = fs.existsSync(dataDir);

  if (!dataDirExists || !clusterReady) {
    logger.warn(
      "PostgreSQL data directory missing or empty — resetting credentials and re-initializing cluster",
      { dataDir, dataDirExists, clusterReady },
    );
    removeRuntimeConfigFile();
    if (dataDirExists) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    const cfg = await createFreshRuntimeConfig();
    await runInitDb(dataDir, cfg.password);
    appendLocalhostConfig(dataDir, cfg.port);
    clusterInitializedThisSession = true;
    return cfg;
  }

  let cfg = loadRuntimeConfig() ?? loadLegacyRuntimeConfig();
  if (cfg) {
    cfg = { ...cfg, dataDir, host: normalizeRuntimeBindHost(cfg.host) };
    saveRuntimeConfig(cfg);
    if (fs.existsSync(getLegacyRuntimeConfigPath())) {
      fs.unlinkSync(getLegacyRuntimeConfigPath());
    }
    return cfg;
  }

  logger.warn(
    "PostgreSQL cluster exists but postgres-runtime.json is missing — full coordinated reset",
    { dataDir },
  );
  removeRuntimeConfigFile();
  fs.rmSync(dataDir, { recursive: true, force: true });
  const resetCfg = await createFreshRuntimeConfig();
  await runInitDb(dataDir, resetCfg.password);
  appendLocalhostConfig(dataDir, resetCfg.port);
  clusterInitializedThisSession = true;
  return resetCfg;
}

export function buildPostgresConnectionUrl(cfg: PostgresRuntimeConfig): string {
  const connectHost = resolvePostgresConnectHost(cfg);
  const encUser = encodeURIComponent(cfg.user);
  const encPass = encodeURIComponent(cfg.password);
  return `postgresql://${encUser}:${encPass}@${connectHost}:${cfg.port}/${cfg.database}?schema=public`;
}

export function getEmbeddedDatabaseUrl(): string {
  if (!databaseUrl) {
    throw new Error("Embedded PostgreSQL is not running. Call startEmbeddedPostgres() before Prisma connects.");
  }
  return databaseUrl;
}

/** In-memory config while embedded PG is running, else persisted postgres-runtime.json on disk. */
export function getPostgresRuntimeConfig(): PostgresRuntimeConfig | null {
  return runtimeConfig ?? loadRuntimeConfig();
}

function isClusterInitialized(dataDir: string): boolean {
  return fs.existsSync(path.join(dataDir, "PG_VERSION"));
}

/** Credentials file for initdb — must NOT live inside PGDATA (initdb requires an empty directory). */
function getInitPasswordFilePath(): string {
  return path.join(resolveAppDataRoot(), ".init_pw");
}

/**
 * Ensure PGDATA is empty before initdb. Removes partial clusters (e.g. stray .init_pw from older builds).
 */
function prepareEmptyDataDirectory(dataDir: string): void {
  if (isClusterInitialized(dataDir)) return;

  if (fs.existsSync(dataDir)) {
    const entries = fs.readdirSync(dataDir);
    if (entries.length > 0) {
      logger.warn("Clearing non-initialized PostgreSQL data directory before initdb", {
        dataDir,
        entries,
      });
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }

  fs.mkdirSync(dataDir, { recursive: true });
}

async function isPortFree(port: number, host: string = POSTGRES_CLIENT_CONNECT_HOST): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function pickListenPort(preferred = DEFAULT_PORT): Promise<number> {
  for (let port = preferred; port < preferred + 64; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(
    `No free TCP port on ${POSTGRES_CLIENT_CONNECT_HOST} (${preferred}–${preferred + 63}).`,
  );
}

async function waitForTcp(host: string, port: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host, port }, () => {
          socket.end();
          resolve();
        });
        socket.once("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`PostgreSQL did not accept connections on ${host}:${port} within ${timeoutMs}ms.`);
}

const BENBEN_CONF_MARKER = "# Benben embedded instance (auto-generated)";

const LAN_HBA_RULES = [
  `host    all             all             ${POSTGRES_LEGACY_LOOPBACK_HOST}/32            scram-sha-256`,
  "host    all             all             192.168.0.0/16          scram-sha-256",
  "host    all             all             10.0.0.0/8              scram-sha-256",
  "host    all             all             172.16.0.0/12           scram-sha-256",
] as const;

function ensureHbaRules(hbaPath: string): void {
  let hba = fs.readFileSync(hbaPath, "utf8");
  for (const rule of LAN_HBA_RULES) {
    const cidr = rule.split(/\s+/)[3];
    if (!cidr || hba.includes(cidr)) continue;
    hba += `${rule}\n`;
  }
  fs.writeFileSync(hbaPath, hba, "utf8");
}

function applyEmbeddedClusterNetworkConfig(dataDir: string, port: number): void {
  const confPath = path.join(dataDir, "postgresql.conf");
  const hbaPath = path.join(dataDir, "pg_hba.conf");

  let conf = fs.readFileSync(confPath, "utf8");
  const block = `
${BENBEN_CONF_MARKER}
listen_addresses = '*'
port = ${port}
max_connections = 32
shared_buffers = 128MB
logging_collector = off
`;

  const start = conf.indexOf(BENBEN_CONF_MARKER);
  if (start >= 0) {
    const afterMarker = conf.slice(start + BENBEN_CONF_MARKER.length);
    const nextBlock = afterMarker.search(/\n# [A-Za-z]/);
    const end = nextBlock >= 0 ? start + BENBEN_CONF_MARKER.length + nextBlock : conf.length;
    conf = conf.slice(0, start).trimEnd() + block + conf.slice(end);
  } else {
    conf = `${conf.trimEnd()}\n${block}`;
  }
  fs.writeFileSync(confPath, conf, "utf8");
  ensureHbaRules(hbaPath);
}

function appendLocalhostConfig(dataDir: string, port: number): void {
  applyEmbeddedClusterNetworkConfig(dataDir, port);
}

async function runInitDb(dataDir: string, password: string): Promise<void> {
  const initdb = resolvePostgresBinary("initdb");
  if (!fs.existsSync(initdb)) {
    throw new Error(
      `PostgreSQL initdb not found (${initdb}). ` +
        `Expected bin directory: ${getPostgresBinDirectory()} ` +
        `(packaged=${app.isPackaged}, resourcesPath=${process.resourcesPath}). ` +
        "Rebuild with electron-builder extraResources or set BENBEN_POSTGRES_BIN_DIR.",
    );
  }

  prepareEmptyDataDirectory(dataDir);

  const pwFile = getInitPasswordFilePath();
  fs.writeFileSync(pwFile, `${password}\n`, { encoding: "utf8", mode: 0o600 });

  logger.info("Initializing embedded PostgreSQL cluster", { dataDir, initdb, pwFile });
  try {
    await execFileAsync(
      initdb,
      [
        "-D",
        dataDir,
        "-U",
        DB_SUPERUSER,
        "--encoding=UTF8",
        "--locale=C",
        "-A",
        "scram-sha-256",
        `--pwfile=${pwFile}`,
      ],
      { env: { ...process.env }, maxBuffer: 8 * 1024 * 1024 },
    );
  } finally {
    try {
      fs.unlinkSync(pwFile);
    } catch {
      /* ignore */
    }
  }
}

/** Resolve superuser password from in-memory config or persisted runtime.json. */
function resolvePostgresPassword(cfg: PostgresRuntimeConfig): string {
  const fromCfg = cfg.password?.trim();
  if (fromCfg) return fromCfg;

  const persisted = loadRuntimeConfig();
  const fromDisk = persisted?.password?.trim();
  if (fromDisk) return fromDisk;

  throw new Error(
    "PostgreSQL password is not configured. Delete postgres-runtime.json and .benben-db only if you intend a full reset.",
  );
}

/** Read initdb pwfile if present (same boot window as cluster creation). */
function readInitPasswordFile(): string | null {
  const pwFile = getInitPasswordFilePath();
  if (!fs.existsSync(pwFile)) return null;
  try {
    const line = fs.readFileSync(pwFile, "utf8").split(/\r?\n/)[0]?.trim();
    return line || null;
  } catch {
    return null;
  }
}

/** Reload canonical credentials from disk (and first-boot fallbacks) into the active config. */
function applyRuntimeConfigFromDisk(cfg: PostgresRuntimeConfig): PostgresRuntimeConfig {
  const disk = loadRuntimeConfig() ?? loadLegacyRuntimeConfig();
  if (disk?.password?.trim()) {
    return {
      ...cfg,
      host: disk.host ?? cfg.host,
      port: disk.port ?? cfg.port,
      user: disk.user ?? cfg.user,
      password: disk.password,
      database: disk.database ?? cfg.database,
      dataDir: getPostgresDataDir(),
    };
  }

  if (clusterInitializedThisSession) {
    const fromInitPw = readInitPasswordFile();
    if (fromInitPw) {
      logger.info("psql auth recovery: using .init_pw from current initdb session");
      return { ...cfg, password: fromInitPw, dataDir: getPostgresDataDir() };
    }
  }

  return cfg;
}

/** Child-process environment for psql — must include PGPASSWORD for scram auth on localhost. */
function buildPsqlExecEnv(cfg: PostgresRuntimeConfig): NodeJS.ProcessEnv {
  const password = resolvePostgresPassword(cfg);
  return {
    ...process.env,
    PGPASSWORD: password,
    PGUSER: cfg.user,
    PGHOST: resolvePostgresConnectHost(cfg),
    PGPORT: String(cfg.port),
    PGDATABASE: "postgres",
  };
}

function isPasswordAuthenticationError(err: unknown): boolean {
  return formatPsqlExecError(err).toLowerCase().includes("password authentication failed");
}

/** Flatten execFile / spawn errors for logging and matching. */
function formatPsqlExecError(err: unknown): string {
  const execErr = err as { message?: string; stderr?: string; stdout?: string; code?: string | number };
  return [execErr.message, execErr.stderr, execErr.stdout, execErr.code != null ? `code=${execErr.code}` : "", String(err)]
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Broad startup-phase matcher (used for log classification only).
 * Pre-flight retries treat any psql failure as "still warming up" until max attempts.
 */
function isPostgresStartingUpError(err: unknown): boolean {
  const blob = formatPsqlExecError(err).toLowerCase();
  if (!blob) return true;
  const markers = [
    "the database system is starting up",
    "database system is not yet accepting",
    "the database system is shutting down",
    "connection to server at",
    "connection refused",
    "could not connect to server",
    "server closed the connection unexpectedly",
    "timeout expired",
    "fatal:",
    "fatal ",
    "psql: error",
    "terminating connection",
    "recovery",
  ];
  return markers.some((m) => blob.includes(m));
}

/** Run psql once with full auth env (async execFile). */
async function execPsqlOnce(
  psql: string,
  args: string[],
  cfg: PostgresRuntimeConfig,
): Promise<string> {
  const safeArgs = sanitizePsqlCliArgs(args);
  const hostFlagIdx = safeArgs.findIndex((a) => a === "-h" || a === "--host");
  if (hostFlagIdx >= 0) {
    const rawHost = args[hostFlagIdx + 1];
    const resolvedHost = safeArgs[hostFlagIdx + 1];
    if (rawHost !== resolvedHost) {
      logger.info("psql connect host normalized for loopback", {
        from: rawHost,
        to: resolvedHost,
      });
    }
  }
  return execFileAsync(psql, safeArgs, {
    env: buildPsqlExecEnv(cfg),
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
}

/** Inner retry loop (startup vs auth-recovery credentials). */
async function execPsqlAttemptLoop(
  psql: string,
  args: string[],
  cfg: PostgresRuntimeConfig,
  label: string,
): Promise<string> {
  let lastError: unknown;
  let lastDetail = "";

  for (let attempt = 1; attempt <= MAX_PSQL_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await sleepBetweenPsqlAttempts(attempt, label);
    }

    try {
      const stdout = await execPsqlOnce(psql, args, cfg);
      if (attempt > 1) {
        logger.info(`psql pre-flight succeeded on attempt ${attempt}/${MAX_PSQL_ATTEMPTS}`, { label });
      }
      return stdout;
    } catch (error) {
      lastError = error;
      lastDetail = formatPsqlExecError(error);

      if (isPasswordAuthenticationError(error)) {
        throw error;
      }

      const likelyStartup = isPostgresStartingUpError(error);

      if (attempt < MAX_PSQL_ATTEMPTS) {
        logger.warn(
          `psql pre-flight (${label}): attempt ${attempt}/${MAX_PSQL_ATTEMPTS} failed — ` +
            `PostgreSQL may still be starting; next attempt follows ${PSQL_RETRY_DELAY_MS}ms pause.`,
          {
            likelyStartup,
            detail: lastDetail.slice(0, 2000),
          },
        );
        continue;
      }

      logger.error(
        `psql pre-flight (${label}): all ${MAX_PSQL_ATTEMPTS} attempts failed`,
        { detail: lastDetail.slice(0, 2000) },
      );
      throw new Error(
        `psql pre-flight failed after ${MAX_PSQL_ATTEMPTS} attempts (${label}): ${lastDetail || "unknown error"}`,
        { cause: lastError instanceof Error ? lastError : undefined },
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(lastDetail || `psql pre-flight failed (${label})`);
}

/**
 * Sequential psql pre-flight with auth recovery: on password failure, reload postgres-runtime.json
 * (and in-memory runtimeConfig) before giving up.
 */
async function execPsqlWithRetry(
  psql: string,
  args: string[],
  cfg: PostgresRuntimeConfig,
  label: string,
): Promise<string> {
  let activeCfg: PostgresRuntimeConfig = {
    ...cfg,
    password: resolvePostgresPassword(cfg),
    dataDir: getPostgresDataDir(),
  };

  try {
    return await execPsqlAttemptLoop(psql, args, activeCfg, label);
  } catch (error) {
    if (!isPasswordAuthenticationError(error)) throw error;

    const detail = formatPsqlExecError(error);
    logger.warn(`psql pre-flight (${label}): auth failed — reloading postgres-runtime.json and retrying`, {
      configPath: getPostgresConfigPath(),
      clusterInitializedThisSession,
      detail: detail.slice(0, 2000),
    });

    activeCfg = applyRuntimeConfigFromDisk(activeCfg);
    if (runtimeConfig) {
      runtimeConfig = { ...runtimeConfig, password: activeCfg.password };
    }

    try {
      return await execPsqlAttemptLoop(psql, args, activeCfg, `${label}-credential-recovery`);
    } catch (retryErr) {
      if (!isPasswordAuthenticationError(retryErr)) throw retryErr;

      const retryDetail = formatPsqlExecError(retryErr);
      logger.error(`psql pre-flight (${label}): authentication failed after credential recovery`, {
        user: activeCfg.user,
        configPath: getPostgresConfigPath(),
        detail: retryDetail.slice(0, 2000),
      });
      throw new Error(
        `psql pre-flight authentication failed (${label}). ` +
          `Delete ${getPostgresConfigPath()} and ${getPostgresDataDir()} together for a clean install.`,
        { cause: retryErr instanceof Error ? retryErr : undefined },
      );
    }
  }
}

async function ensureApplicationDatabase(cfg: PostgresRuntimeConfig): Promise<void> {
  const psql = resolvePostgresBinary("psql");
  if (!fs.existsSync(psql)) {
    throw new Error(`PostgreSQL psql not found (${psql}).`);
  }

  // Sync password from disk if the in-memory cfg predates postgres-runtime.json write.
  const authCfg: PostgresRuntimeConfig = {
    ...cfg,
    password: resolvePostgresPassword(cfg),
  };

  const connectHost = resolvePostgresConnectHost(authCfg);
  const baseArgs = ["-h", connectHost, "-p", String(authCfg.port), "-U", authCfg.user, "-d", "postgres"];

  const checkOut = await execPsqlWithRetry(
    psql,
    [
      ...baseArgs,
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname='${authCfg.database.replace(/'/g, "''")}'`,
    ],
    authCfg,
    "check-database-exists",
  );

  if (checkOut.trim() === "1") return;

  logger.info("Creating application database", { database: authCfg.database });
  await execPsqlWithRetry(
    psql,
    [
      ...baseArgs,
      "-c",
      `CREATE DATABASE "${authCfg.database.replace(/"/g, '""')}" OWNER "${authCfg.user.replace(/"/g, '""')}";`,
    ],
    authCfg,
    "create-application-database",
  );
}

function spawnPostgresServer(cfg: PostgresRuntimeConfig): ChildProcess {
  const postgres = resolvePostgresBinary("postgres");
  if (!fs.existsSync(postgres)) {
    throw new Error(`PostgreSQL server binary not found (${postgres}).`);
  }

  const args = ["-D", cfg.dataDir, "-p", String(cfg.port), "-c", "listen_addresses=*"];

  logger.info("Starting embedded PostgreSQL", {
    postgres,
    port: cfg.port,
    dataDir: cfg.dataDir,
    listenAddresses: "*",
    lanAccess: "192.168.0.0/16, 10.0.0.0/8 (scram-sha-256)",
  });

  const child = spawn(postgres, args, {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString("utf8").trim();
    if (line) logger.info("postgres stdout", { line: line.slice(0, 500) });
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString("utf8").trim();
    if (line) logger.info("postgres stderr", { line: line.slice(0, 500) });
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      logger.warn("Embedded PostgreSQL exited unexpectedly", { code, signal });
    }
    postgresProcess = null;
  });

  return child;
}

async function stopWithPgCtl(dataDir: string, mode: "fast" | "immediate" = "fast"): Promise<void> {
  const pgCtl = resolvePostgresBinary("pg_ctl");
  if (!fs.existsSync(pgCtl) || !isClusterInitialized(dataDir)) return;
  try {
    await execFileAsync(pgCtl, ["stop", "-D", dataDir, "-m", mode, "-w"], {
      timeout: SHUTDOWN_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch (err) {
    logger.warn("pg_ctl stop failed", { mode, err });
  }
}

/** Stop a prior embedded instance left running after an unclean app exit. */
async function reconcileStaleServerBeforeSpawn(cfg: PostgresRuntimeConfig): Promise<void> {
  const connectHost = resolvePostgresConnectHost(cfg);
  const portBusy = !(await isPortFree(cfg.port, connectHost));

  if (portBusy) {
    logger.warn("PostgreSQL port already in use — stopping prior embedded instance", {
      port: cfg.port,
      dataDir: cfg.dataDir,
    });
    await stopWithPgCtl(cfg.dataDir, "fast");
    await delayMs(2000);
    if (!(await isPortFree(cfg.port, connectHost))) {
      await stopWithPgCtl(cfg.dataDir, "immediate");
      await delayMs(1500);
    }
  }

  const pidPath = path.join(cfg.dataDir, "postmaster.pid");
  if (fs.existsSync(pidPath) && (await isPortFree(cfg.port, connectHost))) {
    logger.warn("Removing stale postmaster.pid after port was freed", { pidPath });
    try {
      fs.unlinkSync(pidPath);
    } catch (err) {
      logger.warn("Could not remove stale postmaster.pid", err);
    }
  }
}

/** Re-verify embedded PostgreSQL accepts SQL before Prisma CLI / schema push. */
export async function assertEmbeddedPostgresQueryable(label = "pre-migration"): Promise<void> {
  const cfg = runtimeConfig;
  if (!cfg) {
    throw new Error("Embedded PostgreSQL is not running. Call startEmbeddedPostgres() first.");
  }
  const psql = resolvePostgresBinary("psql");
  if (!fs.existsSync(psql)) {
    throw new Error(`PostgreSQL psql not found (${psql}).`);
  }
  await waitForPostgresQueryReady(psql, cfg, label);
}

async function waitForPostgresQueryReady(
  psql: string,
  cfg: PostgresRuntimeConfig,
  label: string,
): Promise<void> {
  const connectHost = resolvePostgresConnectHost(cfg);
  const baseArgs = ["-h", connectHost, "-p", String(cfg.port), "-U", cfg.user, "-d", "postgres"];
  const started = Date.now();

  while (Date.now() - started < POSTGRES_QUERY_READY_TIMEOUT_MS) {
    try {
      await execPsqlOnce(psql, [...baseArgs, "-tAc", "SELECT 1"], cfg);
      return;
    } catch (err) {
      const detail = formatPsqlExecError(err).slice(0, 300);
      logger.info(`PostgreSQL warming up (${label})`, { detail });
      await delayMs(500);
    }
  }

  throw new Error(
    `PostgreSQL did not accept SQL queries within ${POSTGRES_QUERY_READY_TIMEOUT_MS}ms (${label}).`,
  );
}

/** Boot sequence: init cluster (if needed) → spawn postgres → wait → create DB → set DATABASE_URL. */
export async function startEmbeddedPostgres(): Promise<PostgresRuntimeConfig> {
  if (runtimeConfig && databaseUrl && postgresProcess && !postgresProcess.killed) {
    return runtimeConfig;
  }

  if (
    process.env.DATABASE_URL?.startsWith("postgresql://") &&
    (process.env.BENBEN_SKIP_EMBEDDED_PG === "1" || process.env.NEXUSCORE_SKIP_EMBEDDED_PG === "1")
  ) {
    databaseUrl = process.env.DATABASE_URL;
    logger.info("Using external DATABASE_URL (embedded PG skipped)", {
      url: databaseUrl.replace(/:[^:@/]+@/, ":***@"),
    });
    return loadRuntimeConfig() ?? {
      version: CONFIG_VERSION,
      host: POSTGRES_RUNTIME_BIND_HOST,
      port: DEFAULT_PORT,
      database: DB_NAME,
      user: DB_SUPERUSER,
      password: "",
      dataDir: getPostgresDataDir(),
      createdAt: new Date().toISOString(),
    };
  }

  const cfg = await reconcileClusterAndRuntime();
  appendLocalhostConfig(cfg.dataDir, cfg.port);

  await reconcileStaleServerBeforeSpawn(cfg);

  postgresProcess = spawnPostgresServer(cfg);
  const connectHost = resolvePostgresConnectHost(cfg);
  await waitForTcp(connectHost, cfg.port, STARTUP_TIMEOUT_MS);

  const psql = resolvePostgresBinary("psql");
  if (!fs.existsSync(psql)) {
    throw new Error(`PostgreSQL psql not found (${psql}).`);
  }
  await waitForPostgresQueryReady(psql, cfg, "post-tcp");

  await ensureApplicationDatabase(cfg);

  runtimeConfig = cfg;
  databaseUrl = buildPostgresConnectionUrl(cfg);
  process.env.DATABASE_URL = databaseUrl;

  registerPostgresShutdownHooks();

  const binDir = getPostgresBinDirectory();
  logger.info("Embedded PostgreSQL ready", {
    bindHost: cfg.host,
    connectHost,
    port: cfg.port,
    database: cfg.database,
    dataDir: cfg.dataDir,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    postgresBinDir: binDir,
    postgresExeExists: fs.existsSync(path.join(binDir, binName("postgres"))),
  });

  return cfg;
}

/** Graceful shutdown — pg_ctl fast stop, then kill orphaned child if needed. */
export async function stopEmbeddedPostgres(): Promise<void> {
  if (stopping) return;
  stopping = true;

  const dataDir = runtimeConfig?.dataDir ?? getPostgresDataDir();

  try {
    if (postgresProcess && !postgresProcess.killed) {
      postgresProcess.kill("SIGINT");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000);
        postgresProcess?.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await stopWithPgCtl(dataDir, "fast");
    if (runtimeConfig?.port) {
      const connectHost = resolvePostgresConnectHost(runtimeConfig);
      if (!(await isPortFree(runtimeConfig.port, connectHost))) {
        await stopWithPgCtl(dataDir, "immediate");
      }
    }
  } finally {
    postgresProcess = null;
    runtimeConfig = null;
    databaseUrl = null;
    stopping = false;
    logger.info("Embedded PostgreSQL stopped");
  }
}

function syncStopEmbeddedPostgres(): void {
  try {
    const dataDir = getPostgresDataDir();
    if (postgresProcess && !postgresProcess.killed) {
      postgresProcess.kill("SIGTERM");
    }
    const pgCtl = resolvePostgresBinary("pg_ctl");
    if (fs.existsSync(pgCtl) && isClusterInitialized(dataDir)) {
      execFile(pgCtl, ["stop", "-D", dataDir, "-m", "fast"], { windowsHide: true }, () => undefined);
    }
  } catch {
    /* best-effort on process exit */
  }
}

/**
 * Node process exit + signal hooks (Electron `before-quit` is wired in main.ts).
 * Prevents orphaned postgres workers when the shell closes or the process is killed.
 */
export function registerPostgresShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;

  process.on("exit", () => syncStopEmbeddedPostgres());
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      void stopEmbeddedPostgres().finally(() => process.exit(sig === "SIGINT" ? 0 : 1));
    });
  }
}
