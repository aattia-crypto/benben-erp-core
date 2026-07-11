/**
 * Bundle preload into one file for sandboxed Electron (no sibling require()).
 * Run after tsc: node scripts/bundle-preload.mjs
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "dist-desktop", "preload.js");

await esbuild.build({
  entryPoints: [path.join(root, "desktop", "preload.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile,
  format: "cjs",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
});

console.log("Bundled preload:", outfile);
