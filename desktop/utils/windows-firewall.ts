import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { logger } from "./logger";

const execFileAsync = promisify(execFile);

/** Best-effort inbound allow rules for Benben LAN services (requires Administrator). */
export async function ensureBenbenFirewallRules(): Promise<void> {
  if (process.platform !== "win32") return;

  const rules: { name: string; port: number }[] = [
    { name: "Benben PostgreSQL (TCP 5433)", port: 5433 },
    { name: "Benben Finance API (TCP 3847)", port: 3847 },
    { name: "Benben LAN UI (TCP 8080)", port: 8080 },
  ];

  for (const rule of rules) {
    try {
      await execFileAsync(
        "netsh",
        [
          "advfirewall",
          "firewall",
          "add",
          "rule",
          `name=${rule.name}`,
          "dir=in",
          "action=allow",
          "protocol=TCP",
          `localport=${rule.port}`,
          "profile=private",
        ],
        { windowsHide: true },
      );
      logger.info("Windows Firewall rule added", { rule: rule.name, port: rule.port });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("already exists")) {
        logger.info("Windows Firewall rule already present", { rule: rule.name });
        continue;
      }
      logger.warn(
        "Could not add Windows Firewall rule (run app as Administrator once, or add manually)",
        { rule: rule.name, port: rule.port, detail: message.slice(0, 300) },
      );
    }
  }
}
