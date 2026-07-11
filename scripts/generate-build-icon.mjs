/**
 * Generates build/icon.ico for electron-builder (Windows NSIS + executable branding).
 * Requires: npm install --no-save sharp to-ico  (or add them as devDependencies)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const pngPath = path.join(buildDir, "icon.png");
const icoPath = path.join(buildDir, "icon.ico");
const svgPath = path.join(root, "renderer", "public", "favicon.svg");

fs.mkdirSync(buildDir, { recursive: true });

if (!fs.existsSync(svgPath)) {
  throw new Error(`Missing source SVG: ${svgPath}`);
}

let sharp;
let toIco;
try {
  sharp = (await import("sharp")).default;
  toIco = (await import("to-ico")).default;
} catch {
  throw new Error(
    "Install icon tooling first: npm install --no-save sharp to-ico",
  );
}

const pngBuffer = await sharp(svgPath).resize(256, 256).png().toBuffer();
fs.writeFileSync(pngPath, pngBuffer);
fs.writeFileSync(icoPath, await toIco(pngBuffer));

console.log(`[generate-build-icon] wrote ${icoPath}`);
