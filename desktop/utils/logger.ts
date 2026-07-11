import fs from "node:fs";
import path from "node:path";

import { getLogsDir } from "./paths";

const LOG_FILE = "benben.log";

function logPath(): string {
  return path.join(getLogsDir(), LOG_FILE);
}

function append(level: string, message: string, detail?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${
    detail !== undefined ? ` ${JSON.stringify(detail)}` : ""
  }\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(logPath(), line, "utf8");
  } catch {
    // logging must not crash the app
  }
}

export const logger = {
  info: (message: string, detail?: unknown) => append("INFO", message, detail),
  warn: (message: string, detail?: unknown) => append("WARN", message, detail),
  error: (message: string, detail?: unknown) => append("ERROR", message, detail),
};
