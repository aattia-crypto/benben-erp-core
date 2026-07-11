/**
 * Standalone Finance API for browser-only UI dev (npm run dev:ui).
 * Run alongside the Vite server — requests proxy /api to http://127.0.0.1:3847
 *
 *   npm run dev:finance-api
 *   npm run dev:ui
 */
import { app } from "electron";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load(modulePath) {
  return require(path.join(root, "dist-desktop", modulePath));
}

app.whenReady().then(async () => {
  const { ensureAppDataDirs } = load("utils/paths");
  const { bootstrapDatabase } = load("services/database");
  const { startFinanceApiServer, getFinanceApiClientUrl } = load("server/finance-api-server");

  ensureAppDataDirs();
  await bootstrapDatabase();
  await startFinanceApiServer();
  const url = getFinanceApiClientUrl();
  console.log(`[dev:finance-api] Finance API listening at ${url}`);
  console.log("[dev:finance-api] Health check:", `${url}/api/finance/health`);
  console.log("[dev:finance-api] Leave this process running while using npm run dev:ui");
});

app.on("window-all-closed", () => {
  // Keep the API process alive (no BrowserWindow).
});
