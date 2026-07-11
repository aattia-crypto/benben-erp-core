import fs from "node:fs";
import path from "node:path";

import { APP_NAME, DEMO_APP_NAME } from "../constants";

let demoBuildCached: boolean | null = null;

export function isDemoBuild(): boolean {
  if (process.env.BENBEN_BUILD_FLAVOR === "demo") return true;
  if (demoBuildCached !== null) return demoBuildCached;
  try {
    const stampPath = path.join(__dirname, "build-stamp.json");
    const stamp = JSON.parse(fs.readFileSync(stampPath, "utf8")) as { flavor?: string };
    demoBuildCached = stamp.flavor === "demo";
  } catch {
    demoBuildCached = false;
  }
  return demoBuildCached;
}

export function getAppNameForBuild(): string {
  return isDemoBuild() ? DEMO_APP_NAME : APP_NAME;
}