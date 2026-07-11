import { app, BrowserWindow, dialog, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { DEFAULT_UI_URL } from "./constants";
import { registerAllIpcHandlers } from "./ipc";
import { registerPrintIpc } from "./ipc/print.ipc";
import { getSystemStatus } from "./services/system-status.service";
import {
  tryLoadPremiumLicenseModule,
  type MainWindowNavigationOptions,
} from "./services/premium-license-loader";
import { getAppNameForBuild, isDemoBuild } from "./utils/build-flavor";
import {
  assertProductionUiAssets,
  getProductionUiIndexPath,
  getRendererDistDir,
} from "./utils/ui-paths";
import { bootstrapDatabase, disconnectDatabase } from "./services/database";
import { checkDatabaseIntegrity } from "./services/db-integrity.service";
import { startBackupScheduler, stopBackupScheduler } from "./services/backup-scheduler.service";
import { startUpdateScheduler, stopUpdateScheduler } from "./services/update.service";
import {
  getFinanceApiClientUrl,
  isFinanceApiServerRunning,
  startFinanceApiServer,
  stopFinanceApiServer,
} from "./server/finance-api-server";
import { startLanUiServer, stopLanUiServer } from "./server/lan-ui-server";
import { getPostgresRuntimeConfig } from "./services/postgres-lifecycle.service";
import { formatLanServiceUrls, getLanIPv4Addresses } from "./utils/lan-network";
import { logger } from "./utils/logger";
import { ensureAppDataDirs, getLocalMediaRoot, getLogsDir, getPostgresClusterPath } from "./utils/paths";
import { ensureBenbenFirewallRules } from "./utils/windows-firewall";

const LOCAL_MEDIA_SCHEME = "local-media";

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
      supportFetchAPI: true,
    },
  },
]);

function localMediaRelativeFromUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  // local-media://blindspots/id/file.mp4 — URL host is "blindspots", not part of pathname
  if (url.hostname) {
    return pathname ? `${url.hostname}/${pathname}` : url.hostname;
  }
  return pathname;
}

function localMediaMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
  };
  return map[ext] ?? "application/octet-stream";
}

function respondLocalMediaFile(filePath: string, request: Request): Response {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const contentType = localMediaMimeType(filePath);
  const baseHeaders: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
  };

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      const safeEnd = Math.min(end, size - 1);
      const chunkLength = safeEnd - start + 1;
      const stream = fs.createReadStream(filePath, { start, end: safeEnd });
      return new Response(Readable.toWeb(stream) as BodyInit, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(chunkLength),
          "Content-Range": `bytes ${start}-${safeEnd}/${size}`,
        },
      });
    }
  }

  const stream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as BodyInit, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(size),
    },
  });
}

function resolveLocalMediaPath(relativePath: string): string | null {
  const root = path.resolve(getLocalMediaRoot());
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(root, normalized);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    logger.warn("local-media path escape blocked", { relativePath });
    return null;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

function registerLocalMediaProtocol(): void {
  protocol.handle(LOCAL_MEDIA_SCHEME, (request) => {
    try {
      const relative = localMediaRelativeFromUrl(request.url);
      const filePath = resolveLocalMediaPath(relative);
      if (!filePath) {
        return new Response(null, { status: 404, statusText: "Not Found" });
      }
      return respondLocalMediaFile(filePath, request);
    } catch (err) {
      logger.error("local-media protocol failed", err);
      return new Response(null, { status: 500, statusText: "Internal Error" });
    }
  });
}

/** One desktop process owns embedded PostgreSQL — reject duplicate launches before any DB/window work. */
const isInternalNodeChild = process.env.ELECTRON_RUN_AS_NODE === "1";
const hasSingleInstanceLock = isInternalNodeChild ? true : app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let financeApiBaseUrl = getFinanceApiClientUrl();
let lanUiBaseUrl = "";
let gracefulShutdownStarted = false;


function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function useDevUiServer(): boolean {
  return (
    process.env.BENBEN_USE_DEV_SERVER === "1" ||
    process.env.NEXUSCORE_USE_DEV_SERVER === "1" ||
    (process.env.NODE_ENV === "development" && !app.isPackaged)
  );
}

function resolveUiUrl(): string {
  return (
    process.env.BENBEN_UI_URL?.trim() ||
    process.env.NEXUSCORE_UI_URL?.trim() ||
    DEFAULT_UI_URL
  );
}

async function navigateMainWindow(route: string, licenseNotice?: string): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createMainWindow({ initialRoute: route, licenseNotice });
    return;
  }

  if (useDevUiServer()) {
    const loadUrl = `${resolveUiUrl()}#${route}`;
    await mainWindow.loadURL(loadUrl);
  } else {
    await mainWindow.loadFile(getProductionUiIndexPath(), { hash: route });
  }

  if (licenseNotice) {
    mainWindow.webContents.once("did-finish-load", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        void mainWindow.webContents.executeJavaScript(
          `window.__BENBEN_LICENSE_NOTICE__ = ${JSON.stringify(licenseNotice)};`,
        );
      }
    });
  }
}

function injectRendererDesktopEnv(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const snippets: string[] = ["window.__BENBEN_DESKTOP_SHELL__ = true;"];
  if (isDemoBuild()) {
    snippets.push("window.__BENBEN_DEMO_BUILD__ = true;");
  }
  if (financeApiBaseUrl) {
    snippets.push(`window.__BENBEN_FINANCE_API__ = ${JSON.stringify(financeApiBaseUrl)};`);
  }
  void mainWindow.webContents.executeJavaScript(snippets.join(" "));
}

function injectDemoBuildFlagToRenderer(): void {
  injectRendererDesktopEnv();
}

function injectFinanceApiUrlToRenderer(): void {
  injectRendererDesktopEnv();
}

async function ensureFinanceApiServer(): Promise<boolean> {
  if (isFinanceApiServerRunning()) {
    financeApiBaseUrl = getFinanceApiClientUrl();
    injectFinanceApiUrlToRenderer();
    return true;
  }
  try {
    financeApiBaseUrl = await startFinanceApiServer();
    injectFinanceApiUrlToRenderer();
    logger.info("Finance API ready", {
      financeApiUrl: financeApiBaseUrl,
      lanUrls: formatLanServiceUrls(3847, "/api/finance/health"),
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Finance API failed to start", err);
    if (message.includes("already in use")) {
      dialog.showErrorBox(
        "Benben — Finance API port blocked",
        `${message}\n\nRevenue recognition, AR/AP, and GL screens need this service on port 3847.`,
      );
    }
    return false;
  }
}

async function createMainWindow(options?: MainWindowNavigationOptions): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: getAppNameForBuild(),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.on("dom-ready", () => {
    injectRendererDesktopEnv();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    injectRendererDesktopEnv();
    if (options?.licenseNotice) {
      void mainWindow?.webContents.executeJavaScript(
        `window.__BENBEN_LICENSE_NOTICE__ = ${JSON.stringify(options.licenseNotice)};`,
      );
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (useDevUiServer()) {
    const uiUrl = resolveUiUrl();
    const loadUrl = options?.initialRoute ? `${uiUrl}#${options.initialRoute}` : uiUrl;
    logger.info("Loading UI from dev server", { uiUrl: loadUrl });
    await mainWindow.loadURL(loadUrl);
    if (process.env.NODE_ENV === "development") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    assertProductionUiAssets();
    const indexPath = getProductionUiIndexPath();
    logger.info("Loading packaged production UI", { indexPath });
    await mainWindow.webContents.session.clearCache();
    if (options?.initialRoute) {
      await mainWindow.loadFile(indexPath, { hash: options.initialRoute });
    } else {
      await mainWindow.loadFile(indexPath);
    }
  }
}

async function bootstrap(): Promise<void> {
  ensureAppDataDirs();

  // Register IPC before any route-specific bootstrap branch so renderer hydration
  // (branding, locations, operations) works on /setup and post-license paths alike.
  registerAllIpcHandlers();
  registerPrintIpc();

  // Open-core: Polar online gating lives in desktop/src/premium (optional).
  // Core always boots local-first — no required internet / Polar phone-home.
  const premiumLicense = tryLoadPremiumLicenseModule();
  if (premiumLicense) {
    const polarGate = premiumLicense.evaluatePolarVaultOnLaunch();
    if (!polarGate.allowed) {
      logger.warn("Premium Polar license gate: onboarding required", polarGate);
      try {
        await bootstrapDatabase();
      } catch (err) {
        logger.warn("Database bootstrap during setup gate failed — wizard will retry", err);
      }
      await ensureFinanceApiServer();
      await createMainWindow({
        initialRoute: polarGate.initialRoute,
        licenseNotice: polarGate.notice,
      });
      return;
    }
    logger.info("Premium Polar license gate: encrypted vault OK");
  } else {
    logger.info("Open-core local-first launch — Polar premium module not active");
  }

  const integrity = checkDatabaseIntegrity();
  if (!integrity.ok) {
    logger.error("Database integrity check failed", integrity);
    dialog.showErrorBox(
      "Benben — database problem",
      `${integrity.message}\n\nPath: ${integrity.path}\n\nRestore a production backup from Settings before continuing.`,
    );
    app.quit();
    return;
  }

  try {
    await bootstrapDatabase();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Database bootstrap failed", err);
    dialog.showErrorBox(
      "Benben — database setup failed",
      `${message}\n\nThe app cannot start until migrations complete. Check logs in:\n${getLogsDir()}`,
    );
    app.quit();
    return;
  }

  startBackupScheduler();
  if (!isDemoBuild()) {
    startUpdateScheduler();
  }

  try {
    await ensureBenbenFirewallRules();
  } catch (err) {
    logger.warn("Windows Firewall setup skipped", err);
  }

  await ensureFinanceApiServer();

  if (!useDevUiServer()) {
    try {
      lanUiBaseUrl = await startLanUiServer();
    } catch (err) {
      logger.error("LAN UI server failed to start", err);
    }
  }

  const pgCfg = getPostgresRuntimeConfig();
  logger.info("LAN service map (for remote devices on same subnet)", {
    hostLanIps: getLanIPv4Addresses(),
    postgres: getLanIPv4Addresses().map((ip) => `${ip}:${pgCfg?.port ?? 5433}`),
    financeApi: formatLanServiceUrls(3847, "/api/finance/health"),
    lanUi: lanUiBaseUrl ? formatLanServiceUrls(8080) : [],
    note: "Remote browsers: open LAN UI URL, sign in with a provisioned account; permissions are enforced server-side.",
  });

  if (!useDevUiServer()) {
    try {
      const status = await getSystemStatus();
      if (!status.uiHasFinanceRoutes) {
        const fp = path.join(getRendererDistDir(), ".stage-fingerprint.json");
        const hint = fs.existsSync(fp)
          ? `Staged UI from ${status.uiStagedAt ?? "unknown"}.`
          : "No staged UI fingerprint found.";
        dialog.showErrorBox(
          "Benben — UI out of date",
          `${hint}\n\nFinance screens (AR, AP, Invoicing) are missing from the packaged UI.\n\n` +
            `Close this app and run from the project folder:\n  npm run build\n\n` +
            `Then start with: npm run start:prod\n(or reinstall after npm run dist).`,
        );
        app.quit();
        return;
      }
      if (!status.financeTablesReady) {
        await dialog.showMessageBox({
          type: "warning",
          title: "Benben — database upgrade pending",
          message: "Finance tables were not found after startup.",
          detail:
            `Database: ${status.databasePath}\n\n` +
            `Try restarting once. If this persists, back up:\n${getPostgresClusterPath()}\nand run npm run db:deploy.`,
        });
      }
    } catch (err) {
      logger.error("System status check failed", err);
    }
  }

  await createMainWindow({ initialRoute: isDemoBuild() ? "/" : undefined });
  // Background Polar heartbeat is commercial-only; never required for open-core.
  if (mainWindow && !isDemoBuild() && premiumLicense) {
    premiumLicense.startBackgroundLicenseHeartbeat(mainWindow, navigateMainWindow);
  }
}

function focusPrimaryWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function registerGracefulShutdown(): void {
  app.on("before-quit", (event) => {
    if (gracefulShutdownStarted) return;
    event.preventDefault();
    gracefulShutdownStarted = true;

    void (async () => {
      try {
        stopBackupScheduler();
        stopUpdateScheduler();
        await stopLanUiServer();
        await stopFinanceApiServer();
        await disconnectDatabase();
      } catch (err) {
        logger.error("Graceful shutdown failed", err);
      } finally {
        app.exit(0);
      }
    })();
  });
}

if (hasSingleInstanceLock && !isInternalNodeChild) {
  app.on("second-instance", () => {
    focusPrimaryWindow();
  });

  app.whenReady().then(async () => {
    registerLocalMediaProtocol();
    await bootstrap();
  });

  registerGracefulShutdown();

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void (async () => {
        await ensureFinanceApiServer();
        await createMainWindow();
      })();
    }
  });
}
