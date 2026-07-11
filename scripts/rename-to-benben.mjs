/**
 * One-shot brand rename: NexusCore -> Benben (preserves nexuscore-erp-main directory paths).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ERP_MAIN_TOKEN = "__ERP_MAIN_DIR__";

const SKIP_DIRS = new Set([
  "node_modules",
  "release",
  "dist-desktop",
  "renderer-dist",
  "nexuscore-erp-main/dist",
  ".git",
  "NexusCore-rc2",
  "win-unpacked",
]);

const EXT = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".json",
  ".yml",
  ".yaml",
  ".txt",
  ".nsh",
  ".prisma",
  ".md",
]);

function shouldSkipDir(rel) {
  const norm = rel.replace(/\\/g, "/");
  return [...SKIP_DIRS].some((d) => norm === d || norm.startsWith(`${d}/`));
}

function transform(content) {
  let s = content.replaceAll("nexuscore-erp-main", ERP_MAIN_TOKEN);
  s = s.replaceAll("NexusCore ERP", "Benben ERP");
  s = s.replaceAll("NexusCore", "Benben");
  s = s.replaceAll("NEXUSCORE", "BENBEN");
  s = s.replaceAll("nexuscore-desktop", "benben-erp");
  s = s.replaceAll("nexuscore-erp", "benben-erp");
  s = s.replaceAll("nexuscore", "benben");
  s = s.replaceAll("com.benben.desktop", "com.benben.erp");
  s = s.replaceAll(ERP_MAIN_TOKEN, "nexuscore-erp-main");
  return s;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(root, full);
    if (ent.isDirectory()) {
      if (shouldSkipDir(rel)) continue;
      walk(full, out);
      continue;
    }
    if (!EXT.has(path.extname(ent.name))) continue;
    if (ent.name === "rename-to-benben.mjs") continue;
    if (ent.name === "package-lock.json") continue;
    out.push(full);
  }
  return out;
}

const files = walk(root);
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    changed++;
  }
}

console.log(`Renamed branding in ${changed} files.`);
