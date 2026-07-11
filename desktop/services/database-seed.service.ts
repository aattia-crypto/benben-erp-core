/**
 * Idempotent system seed — runs after schema push on a fresh embedded PostgreSQL instance.
 */
import bcrypt from "bcryptjs";

import { logActivity } from "./audit.service";
import { seedDemoOperationalData, seedSampleOperationalData } from "./demo-operational-seed.service";
import { bootstrapFinanceModules } from "./finance/bootstrap";
import { createUserWithRole, ensureOrgRoles } from "./permissions.service";
import { isDemoBuild } from "../utils/build-flavor";
import {
  DEMO_BYPASS_USERNAME,
  DEMO_COMPANY_NAME,
} from "../utils/presenter-auth-bypass";
import { logger } from "../utils/logger";
import { ORG_DEFAULT } from "./finance/types";

const BCRYPT_ROUNDS = 10;
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin";
const DEFAULT_ADMIN_ROLE_ID = "admin";

/**
 * When no users exist, provision the default local administrator (admin / admin).
 * Operator must change password on first sign-in.
 */
export async function ensureDefaultAdminUser(orgId = ORG_DEFAULT): Promise<boolean> {
  const { getPrisma } = await import("./database");
  const db = getPrisma();

  const userCount = await db.user.count();
  if (userCount > 0) {
    return false;
  }

  const demoBuild = isDemoBuild();
  const username = demoBuild ? DEMO_BYPASS_USERNAME : DEFAULT_ADMIN_USERNAME;
  const password = demoBuild ? "presenter" : DEFAULT_ADMIN_PASSWORD;
  const displayName = demoBuild ? "Demo Presenter" : "Administrator";
  const companyName = demoBuild ? DEMO_COMPANY_NAME : "Benben";
  const mustChangePassword = !demoBuild;

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { userId } = await createUserWithRole({
    username,
    passwordHash,
    displayName,
    orgId,
    roleId: DEFAULT_ADMIN_ROLE_ID,
    mustChangePassword,
  });

  await db.user.update({
    where: { id: userId },
    data: { isActive: true, role: DEFAULT_ADMIN_ROLE_ID },
  });

  await db.settings.upsert({
    where: { id: "default" },
    create: { id: "default", orgId, companyName },
    update: { orgId, companyName },
  });

  await logActivity({
    orgId,
    userId,
    module: "ADMIN",
    action: demoBuild ? "DEMO_PRESENTER_SEEDED" : "DEFAULT_ADMIN_SEEDED",
    entityType: "User",
    entityId: userId,
    summary: demoBuild
      ? `Presenter Mode administrator "${username}" provisioned for live demonstrations`
      : `Default local administrator "${username}" provisioned (change password on first sign-in)`,
  });

  logger.info(demoBuild ? "Demo presenter administrator seeded" : "Default local administrator seeded", {
    userId,
    username,
    roleId: DEFAULT_ADMIN_ROLE_ID,
    demoBuild,
  });

  return true;
}

/** Corporate structure: AppMeta, enterprise roles/permissions, finance chart/tax/assets, default admin. */
export async function runSystemSeed(orgId = ORG_DEFAULT): Promise<void> {
  const { ensureAppMeta } = await import("./database");

  logger.info("Running system seed", { orgId });

  await ensureAppMeta();
  await ensureOrgRoles(orgId);
  const adminSeeded = await ensureDefaultAdminUser(orgId);
  await bootstrapFinanceModules();
  let operationalSeeded = false;
  if (isDemoBuild()) {
    // Presenter Mode: wipe + full relational hydrate every system seed.
    operationalSeeded = await seedDemoOperationalData(orgId);
  } else {
    // Production exe: one-shot sample ops data only when workspace is empty.
    operationalSeeded = await seedSampleOperationalData(orgId);
  }

  await logActivity({
    orgId,
    module: "ADMIN",
    action: "SYSTEM_SEED_COMPLETED",
    summary: adminSeeded
      ? operationalSeeded
        ? isDemoBuild()
          ? "Enterprise roles, finance defaults, presenter admin, and operational demo data populated"
          : "Enterprise roles, finance defaults, default admin, and sample operational data populated"
        : "Enterprise roles, finance defaults, and default local administrator populated"
      : operationalSeeded
        ? isDemoBuild()
          ? "Enterprise roles, finance defaults, and operational demo data populated"
          : "Enterprise roles, finance defaults, and sample operational data populated"
        : "Enterprise roles and finance defaults populated",
  });

  logger.info("System seed complete", { orgId, adminSeeded, operationalSeeded });
}
