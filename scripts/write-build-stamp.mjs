/**
 * Writes desktop/build-stamp.json (copied into dist-desktop on tsc compile).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const stamp = {
  builtAt: new Date().toISOString(),
  component: "benben-erp",
  version: pkg.version ?? "0.0.0",
  releaseChannel: process.env.BENBEN_RELEASE_CHANNEL ?? "stable",
  flavor: process.env.BENBEN_BUILD_FLAVOR === "demo" ? "demo" : "production",
};

const out = path.join(root, "desktop", "build-stamp.json");
fs.writeFileSync(out, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
console.log("[build-stamp] wrote", out);
