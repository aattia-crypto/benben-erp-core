/**
 * Phase 2 auth service verification — run:
 *   npm run verify:phase2
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

const results = [];
const pass = (n, d) => { results.push(true); console.log(`[PASS] ${n}${d ? `: ${d}` : ""}`); };
const fail = (n, d) => { results.push(false); console.error(`[FAIL] ${n}${d ? `: ${d}` : ""}`); };

app.whenReady().then(async () => {
  try {
    const { ensureAppDataDirs } = load("utils/paths");
    const { bootstrapDatabase, disconnectDatabase } = load("services/database");
    const auth = load("services/auth.service");
    const { registerAuthIpc } = load("ipc/auth.ipc");
    const { IPC } = load("constants");
    const { DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD } = load("services/database-seed.service");

    ensureAppDataDirs();
    await bootstrapDatabase();
    registerAuthIpc();

    pass("Auth IPC channels defined", Object.keys(IPC.auth).join(", "));

    const badLogin = await auth.login(DEFAULT_ADMIN_USERNAME, "wrong");
    if (!badLogin.ok) pass("login rejects bad password");
    else fail("login rejects bad password");

    const goodLogin = await auth.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
    if (goodLogin.ok && goodLogin.data?.token) pass("login service");
    else fail("login service", JSON.stringify(goodLogin));

    if (
      goodLogin.ok &&
      goodLogin.data?.session?.passwordResetRequired === true
    ) {
      pass("default admin requires password reset");
    } else {
      fail("default admin requires password reset", JSON.stringify(goodLogin));
    }

    const session = await auth.getSession(goodLogin.data.token);
    if (session.ok && session.data?.username === DEFAULT_ADMIN_USERNAME) pass("getSession service");
    else fail("getSession service", JSON.stringify(session));

    await auth.logout(goodLogin.data.token);
    const afterLogout = await auth.getSession(goodLogin.data.token);
    if (afterLogout.ok && afterLogout.data === null) pass("logout clears session");
    else fail("logout clears session");

    await disconnectDatabase();
  } catch (e) {
    fail("exception", e instanceof Error ? e.message : String(e));
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n--- ${results.length - failed}/${results.length} checks passed ---`);
  setImmediate(() => app.exit(failed > 0 ? 1 : 0));
});
