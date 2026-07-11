/**
 * Fail fast if Electron renderer-dist was not staged (TanStack dist/client alone is not enough).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDist = path.join(root, "renderer-dist");
const erpClientDist = path.join(root, "renderer", "dist", "client");

function fail(message) {
  console.error(`[renderer-dist] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(rendererDist)) {
  fail(
    `Missing ${rendererDist}. Run "npm run build:ui" from the repo root.`,
  );
}

const indexPath = path.join(rendererDist, "index.html");
if (!fs.existsSync(indexPath)) {
  fail(`Missing ${indexPath}. Stage step did not write Electron index.html.`);
}

const html = fs.readFileSync(indexPath, "utf8");
if (!html.includes("$_TSR")) {
  fail("index.html is missing TanStack $_TSR bootstrap (not an Electron-staged build).");
}
if (html.includes("manifest: {}") || /\bmanifest:\s*\{\s*\}/.test(html)) {
  fail('index.html has empty router manifest. Re-run "npm run build:ui".');
}
if (!html.includes("matches: []") && !html.includes("matches:[]")) {
  fail("index.html must initialize $_TSR.router.matches as an empty array.");
}
if (!html.includes("router:") || !html.includes("manifest:")) {
  fail("index.html must include $_TSR.router.manifest bootstrap.");
}
if (html.includes("location.replace(")) {
  fail("index.html must use location.hash for file:// (not location.replace).");
}

for (const route of ["/ar", "/ap", "/sales-invoicing"]) {
  if (!html.includes(`"${route}"`)) {
    fail(
      `index.html manifest is missing Finance route ${route}. Re-run "npm run build:ui" from repo root.`,
    );
  }
}

const manifestPath = path.join(rendererDist, "tsr-manifest.json");
if (!fs.existsSync(manifestPath)) {
  fail(`Missing ${manifestPath}.`);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!manifest?.routes?.__root__) {
  fail("tsr-manifest.json missing routes.__root__.");
}

const entry = html.match(/src="\.\/assets\/([^"]+)"/)?.[1];
if (!entry) {
  fail("index.html has no ./assets/ script entry.");
}
const assetsDir = path.join(rendererDist, "assets");
const bundlePath = path.join(assetsDir, entry);
if (!fs.existsSync(bundlePath)) {
  fail(`Staged entry bundle missing: ${bundlePath}`);
}

const clientEntry = manifest.clientEntry?.replace(/^\.\//, "");
if (clientEntry && clientEntry !== `assets/${entry}`) {
  fail(`tsr-manifest clientEntry "${manifest.clientEntry}" does not match index.html entry "${entry}".`);
}

const rootPreload = manifest.routes?.__root__?.preloads?.[0];
if (rootPreload) {
  const rootBundle = rootPreload.replace(/^\/\.\//, "").replace(/^\.\//, "");
  if (!rootBundle.endsWith(entry)) {
    fail(
      `Manifest __root__ preload (${rootPreload}) does not reference index.html entry (${entry}). Re-run "npm run build:ui".`,
    );
  }
}

for (const route of Object.values(manifest.routes ?? {})) {
  for (const preload of route.preloads ?? []) {
    const rel = preload.replace(/^\/\.\//, "").replace(/^\.\//, "");
    const assetPath = path.join(rendererDist, rel);
    if (!fs.existsSync(assetPath)) {
      fail(`Manifest preload missing on disk: ${rel}`);
    }
  }
}

const fingerprintPath = path.join(rendererDist, ".stage-fingerprint.json");
if (!fs.existsSync(fingerprintPath)) {
  fail(`Missing ${fingerprintPath}.`);
}
const fingerprint = JSON.parse(fs.readFileSync(fingerprintPath, "utf8"));
if (fingerprint.entry !== entry) {
  fail("stage fingerprint entry does not match index.html.");
}

if (fs.existsSync(erpClientDist) && fs.existsSync(indexPath)) {
  const clientIndex = path.join(erpClientDist, "index.html");
  if (fs.existsSync(clientIndex)) {
    const clientHtml = fs.readFileSync(clientIndex, "utf8");
    if (clientHtml === html) {
      fail(
        "renderer-dist/index.html is identical to renderer/dist/client/index.html — staging did not inject Electron bootstrap.",
      );
    }
  }
}

console.log("[renderer-dist] OK — Electron will package:", rendererDist);
console.log("  (TanStack intermediate outputs stay in renderer/dist/{client,server})");
