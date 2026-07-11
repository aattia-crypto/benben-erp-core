/**
 * Verifies Prisma is packaged for production (after npm run dist:dir).
 *   npm run verify:packaged-prisma
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRISMA_CLI_RUNTIME_DEPS } from "../../scripts/prisma-cli-runtime-deps.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const releaseDir = process.env.BENBEN_RELEASE_DIR?.trim() || "release";
const unpackedRoot = path.join(root, releaseDir, "win-unpacked");
const unpackedExe = path.join(unpackedRoot, "Benben.exe");
const appUnpacked = path.join(unpackedRoot, "resources", "app.asar.unpacked");
const APP_DATA_FOLDER = "Benben ERP";
const appDataRoot = path.join(
  process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"),
  APP_DATA_FOLDER,
);
const logPath = path.join(appDataRoot, "logs", "benben.log");

const checks = [];
const pass = (n, d) => { checks.push(true); console.log(`[PASS] ${n}${d ? `: ${d}` : ""}`); };
const fail = (n, d) => { checks.push(false); console.error(`[FAIL] ${n}${d ? `: ${d}` : ""}`); };

if (!fs.existsSync(unpackedExe)) {
  console.error("Run npm run dist:dir first. Missing:", unpackedExe);
  process.exit(1);
}

const prismaCli = path.join(appUnpacked, "node_modules", "prisma", "build", "index.js");
const schema = path.join(appUnpacked, "prisma", "schema.prisma");
const migrations = path.join(appUnpacked, "prisma", "migrations");
const enginesDir = path.join(appUnpacked, "node_modules", "@prisma", "engines");
const engineFile = path.join(enginesDir, "query_engine-windows.dll.node");
const generatedClient = path.join(appUnpacked, "node_modules", ".prisma", "client", "default.js");

if (fs.existsSync(appUnpacked)) pass("app.asar.unpacked exists", appUnpacked);
else fail("app.asar.unpacked exists");

if (fs.existsSync(prismaCli)) pass("Prisma CLI packaged", prismaCli);
else fail("Prisma CLI packaged");

if (fs.existsSync(schema)) pass("schema.prisma packaged", schema);
else fail("schema.prisma packaged");

if (fs.existsSync(migrations)) pass("migrations packaged", migrations);
else fail("migrations packaged");

if (fs.existsSync(generatedClient)) pass("generated Prisma client", generatedClient);
else fail("generated Prisma client", generatedClient);

if (fs.existsSync(engineFile)) pass("query engine binary", engineFile);
else fail("query engine binary", engineFile);

if (fs.existsSync(path.join(enginesDir, "schema-engine-windows.exe"))) {
  pass("schema engine binary", path.join(enginesDir, "schema-engine-windows.exe"));
} else {
  fail("schema engine binary");
}

for (const dep of PRISMA_CLI_RUNTIME_DEPS) {
  const rel = dep.startsWith("@")
    ? path.join("node_modules", dep.split("/")[0], dep.split("/")[1])
    : path.join("node_modules", dep);
  const full = path.join(appUnpacked, rel, "package.json");
  if (fs.existsSync(full)) pass(`Prisma CLI dep ${dep}`);
  else fail(`Prisma CLI dep ${dep}`, full);
}

console.log("\nLaunching packaged EXE for runtime migration test (25s)...");
const proc = spawn(unpackedExe, [], { stdio: "ignore", detached: false });

await new Promise((r) => setTimeout(r, 25000));

let logTail = "";
if (fs.existsSync(logPath)) {
  logTail = fs.readFileSync(logPath, "utf8");
}

const pgClusterDir = path.join(appDataRoot, ".benben-db");

if (logTail.includes("Database migrations complete")) {
  pass("packaged EXE migrations", "see benben.log");
} else if (logTail.includes("Database connected")) {
  pass("packaged EXE database connected");
} else if (fs.existsSync(pgClusterDir)) {
  pass("packaged EXE PostgreSQL cluster initialized", pgClusterDir);
} else if (logTail.includes("Database bootstrap failed")) {
  fail("packaged EXE bootstrap", logTail.split("\n").slice(-3).join(" "));
} else {
  fail("packaged EXE runtime evidence", `log=${logPath} pgCluster=${pgClusterDir}`);
}

try {
  proc.kill();
} catch {
  /* already exited */
}

const failed = checks.filter((c) => !c).length;
console.log(`\n--- ${checks.length - failed}/${checks.length} checks passed ---`);
process.exit(failed > 0 ? 1 : 0);
