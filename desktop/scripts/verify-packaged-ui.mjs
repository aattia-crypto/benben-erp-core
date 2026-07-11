/**
 * Packaged production UI verification.
 *   npm run verify:packaged-ui
 *
 * Phases:
 *   --pre-package   staged renderer-dist only (before electron-builder)
 *   --packaged-only app.asar + optional EXE launch (after dist:dir)
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rendererDist = path.join(root, "renderer-dist");
const releaseDir = process.env.BENBEN_RELEASE_DIR?.trim() || "release";
const unpackedRoot = path.join(root, releaseDir, "win-unpacked");
const unpackedExe = path.join(unpackedRoot, "Benben.exe");
const asarPath = path.join(unpackedRoot, "resources", "app.asar");
const fsRendererIndex = path.join(
  unpackedRoot,
  "resources",
  "app.asar.unpacked",
  "renderer-dist",
  "index.html",
);

const prePackage = process.argv.includes("--pre-package");
const packagedOnly = process.argv.includes("--packaged-only");

const checks = [];
const pass = (name, detail) => {
  checks.push(true);
  console.log(`[PASS] ${name}${detail ? `: ${detail}` : ""}`);
};
const fail = (name, detail) => {
  checks.push(false);
  console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
};

function parseStagedIndex(html) {
  const entry = html.match(/src="\.\/assets\/([^"]+)"/)?.[1];
  const styles = html.match(/href="\.\/assets\/([^"]+\.css)"/)?.[1];
  return { entry, styles };
}

function verifyRendererDist() {
  const indexPath = path.join(rendererDist, "index.html");
  const assetsDir = path.join(rendererDist, "assets");

  if (!fs.existsSync(indexPath)) {
    fail("renderer-dist/index.html", indexPath);
    return null;
  }
  pass("renderer-dist/index.html");

  const html = fs.readFileSync(indexPath, "utf8");
  const { entry, styles } = parseStagedIndex(html);

  if (!html.includes("$_TSR")) fail("index.html TanStack $_TSR bootstrap");
  else pass("index.html TanStack $_TSR bootstrap");

  const manifestPath = path.join(rendererDist, "tsr-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest?.routes?.__root__) pass("tsr-manifest routes.__root__");
    else fail("tsr-manifest routes.__root__");
  } else {
    fail("tsr-manifest.json", manifestPath);
  }

  if (!entry) fail("index.html script entry ref");
  else pass("index.html script entry", entry);

  if (!styles) fail("index.html stylesheet ref");
  else pass("index.html stylesheet", styles);

  if (!fs.existsSync(assetsDir)) {
    fail("renderer-dist/assets dir", assetsDir);
    return null;
  }
  pass("renderer-dist/assets");

  if (entry && !fs.existsSync(path.join(assetsDir, entry))) {
    fail("staged entry bundle", entry);
  } else if (entry) {
    pass("staged entry bundle", entry);
  }

  if (styles && !fs.existsSync(path.join(assetsDir, styles))) {
    fail("staged stylesheet", styles);
  } else if (styles) {
    pass("staged stylesheet", styles);
  }

  const favicon = path.join(rendererDist, "favicon.svg");
  if (fs.existsSync(favicon)) pass("renderer-dist/favicon.svg");
  else fail("renderer-dist/favicon.svg");

  const indexBundles = fs
    .readdirSync(assetsDir)
    .filter((f) => f.startsWith("index-") && f.endsWith(".js"));
  if (indexBundles.length > 0) pass("client index bundles", String(indexBundles.length));
  else fail("client index bundles");

  if (entry && !indexBundles.includes(entry)) {
    fail("index.html entry not in assets", entry);
  } else if (entry) {
    pass("index.html entry present in assets", entry);
  }

  const fingerprintPath = path.join(rendererDist, ".stage-fingerprint.json");
  if (fs.existsSync(fingerprintPath)) pass(".stage-fingerprint.json");
  else fail(".stage-fingerprint.json", fingerprintPath);

  return { entry, styles };
}

function listAsarEntries(asarFile) {
  const out = execSync(`npx --yes @electron/asar list "${asarFile}"`, {
    encoding: "utf8",
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Set(
    out
      .split(/\r?\n/)
      .map((line) => line.replace(/^[/\\]+/, "").replace(/\\/g, "/").trim())
      .filter(Boolean),
  );
}

function verifyPackagedAsar(staged) {
  if (!fs.existsSync(unpackedExe)) {
    console.error(`Run npm run dist:dir first. Missing: ${unpackedExe}`);
    process.exit(1);
  }
  pass("packaged EXE", unpackedExe);

  if (!fs.existsSync(asarPath)) {
    fail("app.asar", asarPath);
    return;
  }
  pass("app.asar");

  if (fs.existsSync(fsRendererIndex)) {
    pass("unpacked renderer-dist/index.html", fsRendererIndex);
  } else {
    fail("unpacked renderer-dist/index.html", fsRendererIndex);
  }

  let entries;
  try {
    entries = listAsarEntries(asarPath);
  } catch (err) {
    fail("asar list", err instanceof Error ? err.message : String(err));
    return;
  }

  const required = [
    "renderer-dist/index.html",
    "renderer-dist/tsr-manifest.json",
    "renderer-dist/favicon.svg",
    "dist-desktop/main.js",
    "dist-desktop/preload.js",
    "dist-desktop/utils/ui-paths.js",
  ];

  for (const rel of required) {
    if (entries.has(rel)) pass(`asar:${rel}`);
    else fail(`asar:${rel}`);
  }

  if (staged?.entry) {
    const rel = `renderer-dist/assets/${staged.entry}`;
    if (entries.has(rel)) pass("asar:staged entry", staged.entry);
    else fail("asar:staged entry", staged.entry);
  }

  if (staged?.styles) {
    const rel = `renderer-dist/assets/${staged.styles}`;
    if (entries.has(rel)) pass("asar:staged stylesheet", staged.styles);
    else fail("asar:staged stylesheet", staged.styles);
  }

  const packagedAssets = [...entries].filter((e) => e.startsWith("renderer-dist/assets/"));
  if (packagedAssets.length >= 5) pass("asar:renderer asset count", String(packagedAssets.length));
  else fail("asar:renderer asset count", String(packagedAssets.length));

  if (entries.has("desktop/shell/index.html")) {
    fail("placeholder shell packaged (unexpected)");
  } else {
    pass("placeholder shell not packaged");
  }

  const preloadBuilt = path.join(root, "dist-desktop", "preload.js");
  if (fs.existsSync(preloadBuilt)) {
    const preloadSrc = fs.readFileSync(preloadBuilt, "utf8");
    if (preloadSrc.includes('require("./constants")')) {
      fail("preload bundled (still requires ./constants)");
    } else {
      pass("preload bundled (no ./constants require)");
    }
  } else {
    fail("dist-desktop/preload.js for bundle check", preloadBuilt);
  }
}

async function optionalLaunch() {
  if (process.env.VERIFY_PACKAGED_UI_NO_LAUNCH === "1") {
    pass("packaged EXE launch", "skipped (VERIFY_PACKAGED_UI_NO_LAUNCH=1)");
    return;
  }

  const timeoutMs = Number(process.env.VERIFY_PACKAGED_UI_LAUNCH_MS) || 8000;
  console.log(`\nLaunching packaged EXE (${timeoutMs}ms)...`);

  const proc = spawn(unpackedExe, [], { stdio: "ignore", detached: false });
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));

  if (proc.exitCode === null) {
    pass("packaged EXE running", `pid=${proc.pid}`);
  } else if (proc.exitCode === 0) {
    pass("packaged EXE exited cleanly");
  } else {
    fail("packaged EXE exited early", `code=${proc.exitCode}`);
  }

  try {
    proc.kill();
  } catch {
    /* already exited */
  }
}

function summarize() {
  const failed = checks.filter((c) => !c).length;
  console.log(`\n--- ${checks.length - failed}/${checks.length} checks passed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

if (prePackage) {
  console.log("Phase: pre-package (renderer-dist)\n");
  verifyRendererDist();
  summarize();
}

if (!packagedOnly && !prePackage) {
  console.error("Usage: --pre-package | --packaged-only");
  process.exit(1);
}

console.log("Phase: packaged (app.asar)\n");
const staged = verifyRendererDist();
verifyPackagedAsar(staged);
await optionalLaunch();
summarize();
