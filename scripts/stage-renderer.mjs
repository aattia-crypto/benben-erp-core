/**
 * Build ERP client bundle and stage into renderer-dist/ for Electron packaging.
 * Run: node scripts/stage-renderer.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "renderer");
const clientSrc = path.join(rendererDir, "dist", "client");
const serverAssets = path.join(rendererDir, "dist", "server", "assets");
const routeTreeGen = path.join(rendererDir, "src", "routeTree.gen.ts");
const outDir = path.join(root, "renderer-dist");

function logPipeline() {
  console.log("");
  console.log("Electron UI pipeline:");
  console.log("  1) TanStack Start (vite build) → renderer/dist/client + dist/server");
  console.log("  2) Stage for Electron        → renderer-dist/ (packaged by electron-builder)");
  console.log("");
}

function assertRouteTreeSource() {
  if (!fs.existsSync(routeTreeGen)) {
    throw new Error(`Missing ${routeTreeGen}. Run TanStack Router codegen before UI build.`);
  }
}

function runUiBuild() {
  const rendererDist = path.join(rendererDir, "dist");
  if (fs.existsSync(rendererDist)) {
    fs.rmSync(rendererDist, { recursive: true, force: true });
    console.log("Cleared stale TanStack build output:", rendererDist);
  }
  console.log("Building ERP UI (npm run build --workspace renderer)...");
  execSync("npm run build --workspace renderer", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
}

async function loadStartManifest() {
  if (!fs.existsSync(serverAssets)) {
    throw new Error(`Missing ${serverAssets}. UI build did not emit server assets.`);
  }
  const manifestFile = fs
    .readdirSync(serverAssets)
    .find((f) => f.startsWith("_tanstack-start-manifest_v-") && f.endsWith(".js"));
  if (!manifestFile) {
    throw new Error(
      `Missing _tanstack-start-manifest_v-*.js in ${serverAssets}. TanStack Start server build failed.`,
    );
  }
  const mod = await import(pathToFileURL(path.join(serverAssets, manifestFile)).href);
  const manifest = mod.tsrStartManifest?.();
  if (!manifest?.routes?.__root__) {
    throw new Error(`Start manifest missing routes.__root__ (${manifestFile})`);
  }
  return { manifest, manifestFile };
}

function pickClientEntry(assetsDir) {
  const files = fs
    .readdirSync(assetsDir)
    .filter((f) => f.startsWith("index-") && f.endsWith(".js"))
    .map((f) => ({ f, size: fs.statSync(path.join(assetsDir, f)).size }))
    .sort((a, b) => b.size - a.size);
  if (!files.length) throw new Error("No client entry bundle found in dist/client/assets");
  return files[0].f;
}

function pickStylesheet(assetsDir) {
  return fs.readdirSync(assetsDir).find((f) => f.startsWith("styles-") && f.endsWith(".css"));
}

function cryptoPolyfillScript() {
  return `(function(){var c=typeof globalThis!=="undefined"?globalThis.crypto:typeof crypto!=="undefined"?crypto:null;if(c&&typeof c.randomUUID!=="function"&&typeof c.getRandomValues==="function"){c.randomUUID=function(){var b=new Uint8Array(16);c.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=Array.prototype.map.call(b,function(x){return x.toString(16).padStart(2,"0")}).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20)};}})();`;
}

function buildElectronBootstrap(manifest) {
  const manifestJson = JSON.stringify(manifest);
  return `<script>
${cryptoPolyfillScript()}
(function () {
  function useHashRouter() {
    if (location.protocol === "file:") return true;
    if (window.__BENBEN_LAN_MODE__) return true;
    return location.protocol.startsWith("http") && !window.benben;
  }
  if (useHashRouter() && !location.hash) {
    if (location.protocol === "file:") {
      // Never derive routes from file:// pathname (Windows path breaks the router).
      location.hash = "/";
    } else {
      var path = location.pathname.replace(/^\\/+/, "").replace(/index\\.html$/i, "");
      var search = location.search || "";
      var hash = path ? "#/" + path + search : "#/" + search;
      history.replaceState(null, "", location.origin + "/" + hash);
    }
  }
  const manifest = ${manifestJson};
  var prev = window.$_TSR;
  window.$_TSR = {
    buffer: prev && prev.buffer ? prev.buffer : [],
    initialized: false,
    router: {
      matches: [],
      manifest: manifest,
      dehydratedData: null,
      lastMatchId: null,
    },
    h: prev && typeof prev.h === "function" ? prev.h : function () {},
  };
})();
</script>`;
}

function writeStageFingerprint(entry, manifest, manifestFile) {
  const fingerprint = {
    stagedAt: new Date().toISOString(),
    entry,
    manifestFile,
    clientEntry: manifest.clientEntry,
    rootPresent: Boolean(manifest?.routes?.__root__),
  };
  fs.writeFileSync(
    path.join(outDir, ".stage-fingerprint.json"),
    JSON.stringify(fingerprint, null, 2),
    "utf8",
  );
}

function writeElectronIndex(assetsDir, manifest, manifestFile) {
  const entry = pickClientEntry(assetsDir);
  const styles = pickStylesheet(assetsDir);
  manifest.clientEntry = `./assets/${entry}`;
  fs.writeFileSync(path.join(outDir, "tsr-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  writeStageFingerprint(entry, manifest, manifestFile);
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="./" />
    <title>Benben ERP</title>
    <meta name="description" content="Benben — local-first desktop ERP" />
    ${styles ? `<link rel="stylesheet" href="./assets/${styles}" />` : ""}
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
  </head>
  <body>
    ${buildElectronBootstrap(manifest)}
    <script type="module" src="./assets/${entry}"></script>
  </body>
</html>
`;
  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
  console.log("Staged renderer-dist:", outDir);
  console.log("  entry:", entry);
  console.log("  styles:", styles ?? "(none)");
  console.log("  manifest: routes.__root__ present");
}

async function stage() {
  if (!fs.existsSync(clientSrc)) {
    throw new Error(`Missing ${clientSrc}. Run UI build first.`);
  }

  const { manifest, manifestFile } = await loadStartManifest();

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(clientSrc, outDir, { recursive: true });
  writeElectronIndex(path.join(outDir, "assets"), manifest, manifestFile);
  console.log("  source manifest:", manifestFile);
}

try {
  logPipeline();
  assertRouteTreeSource();
  if (process.env.SKIP_UI_BUILD !== "1") {
    runUiBuild();
  } else {
    console.log("Skipping UI build (SKIP_UI_BUILD=1)");
  }
  await stage();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
}
