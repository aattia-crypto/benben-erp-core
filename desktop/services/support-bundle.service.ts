import fs from "node:fs";
import path from "node:path";

import { getExportsDir, getLogsDir, getAppDataRoot } from "../utils/paths";
import { logger } from "../utils/logger";
import { getAppDiagnostics } from "./app.service";
import { getMigrationStatusForDiagnostics } from "./migration.service";

const SENSITIVE_KEYS = /password|secret|token|smtpPassword|authorization/i;

function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (typeof obj !== "object") return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "object") {
      out[k] = redactObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function tailLogFile(maxLines = 200): string {
  const logsDir = getLogsDir();
  if (!fs.existsSync(logsDir)) return "";
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.endsWith(".log"))
    .map((f) => ({ f, m: fs.statSync(path.join(logsDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) return "";
  const content = fs.readFileSync(path.join(logsDir, files[0].f), "utf8");
  return content.split("\n").slice(-maxLines).join("\n");
}

export type SupportBundleInput = {
  clientErrors?: unknown[];
  updateSettings?: unknown;
  locale?: string;
};

export async function createSupportBundle(extra?: SupportBundleInput): Promise<{
  ok: boolean;
  path: string;
  error?: string;
}> {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(getExportsDir(), `support-bundle-${stamp}`);
    fs.mkdirSync(dir, { recursive: true });

    const diagnostics = await getAppDiagnostics();
    fs.writeFileSync(
      path.join(dir, "diagnostics.json"),
      JSON.stringify(redactObject(diagnostics), null, 2),
      "utf8",
    );

    fs.writeFileSync(
      path.join(dir, "migration-status.json"),
      JSON.stringify(getMigrationStatusForDiagnostics(), null, 2),
      "utf8",
    );

    if (extra?.clientErrors?.length) {
      fs.writeFileSync(
        path.join(dir, "client-errors.json"),
        JSON.stringify(redactObject(extra.clientErrors), null, 2),
        "utf8",
      );
    }

    const configPath = path.join(getAppDataRoot(), "config.json");
    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
        fs.writeFileSync(
          path.join(dir, "config-redacted.json"),
          JSON.stringify(redactObject(cfg), null, 2),
          "utf8",
        );
      } catch {
        /* skip */
      }
    }

    const logTail = tailLogFile();
    if (logTail) {
      fs.writeFileSync(path.join(dir, "application-log-tail.txt"), logTail, "utf8");
    }

    fs.writeFileSync(
      path.join(dir, "README.txt"),
      `Benben Support Bundle\nGenerated: ${new Date().toISOString()}\n\n` +
        `Share this folder with Benben support. Credentials are redacted.\n`,
      "utf8",
    );

    logger.info("Support bundle created", { dir });
    return { ok: true, path: dir };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: "", error: message };
  }
}
