/**
 * Validates electron-builder.yml structure and required Benben ERP enterprise packaging keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "electron-builder.yml");
const iconPath = path.join(root, "build", "icon.ico");
const licensePath = path.join(root, "resources", "LICENSE.txt");
const installerHookPath = path.join(root, "resources", "installer.nsh");

const config = fs.readFileSync(configPath, "utf8");

const requiredPatterns = [
  { label: "productName: Benben ERP", pattern: /^productName:\s*Benben ERP\s*$/m },
  { label: "appId: com.benben.erp", pattern: /^appId:\s*com\.benben\.erp\s*$/m },
  { label: "NSIS oneClick: false", pattern: /^ {2}oneClick:\s*false\s*$/m },
  {
    label: "NSIS allowToChangeInstallationDirectory: true",
    pattern: /^ {2}allowToChangeInstallationDirectory:\s*true\s*$/m,
  },
  { label: "NSIS createDesktopShortcut", pattern: /^ {2}createDesktopShortcut:\s*(true|always)\s*$/m },
  { label: "NSIS createStartMenuShortcut: true", pattern: /^ {2}createStartMenuShortcut:\s*true\s*$/m },
  { label: "Windows icon path", pattern: /^ {2}icon:\s*build\/icon\.ico\s*$/m },
];

const failures = [];

for (const { label, pattern } of requiredPatterns) {
  if (!pattern.test(config)) {
    failures.push(`Missing or invalid: ${label}`);
  }
}

for (const assetPath of [iconPath, licensePath, installerHookPath]) {
  if (!fs.existsSync(assetPath)) {
    failures.push(`Missing asset: ${path.relative(root, assetPath)}`);
  }
}

if (failures.length > 0) {
  console.error("[validate-electron-builder-config] FAILED");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("[validate-electron-builder-config] OK — electron-builder.yml and branding assets verified.");
