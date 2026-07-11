import { logger } from "../../utils/logger";
import { seedFinanceDemoData } from "./demo-seed.service";
import { ensureDefaultAssetCategory } from "./fixed-assets.service";
import { ensureDefaultChartOfAccounts } from "./gl.service";
import { ensureDefaultTaxZone } from "./tax.service";

/** Idempotent seed for GL chart, tax zone, asset category, and optional demo transactions. */
export async function bootstrapFinanceModules(): Promise<void> {
  await ensureDefaultChartOfAccounts();
  await ensureDefaultTaxZone();
  await ensureDefaultAssetCategory();
  const demoSeeded = await seedFinanceDemoData();
  logger.info("Finance modules bootstrapped (chart, tax, assets)", { demoSeeded });
}
