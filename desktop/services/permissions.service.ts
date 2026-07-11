/**
 * Enterprise permissions — OrgRole templates + per-user overrides.
 */
import type { OrgRole, User } from "@prisma/client";

import { getPrisma } from "./database";
import { logger } from "../utils/logger";
import {
  presenterBypassAuthContext,
  presenterBypassSessionDto,
  isPresenterBypassToken,
} from "../utils/presenter-auth-bypass";
import {
  PERMISSION_KEYS,
  type PermissionKey,
  type PermissionMap,
} from "./permissions.types";
import { ORG_DEFAULT } from "./finance/types";

export type { PermissionKey, PermissionMap };
export { PERMISSION_KEYS, PERMISSION_LABELS } from "./permissions.types";

type RoleSeed = {
  id: string;
  label: string;
  category: string;
  permissions: Partial<PermissionMap>;
};

const ENTERPRISE_ROLE_SEEDS: RoleSeed[] = [
  {
    id: "admin",
    label: "Admin",
    category: "Administration",
    permissions: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as PermissionMap,
  },
  {
    id: "sales_manager",
    label: "Sales Manager",
    category: "Sales",
    permissions: {
      access_pos: true,
      export_reports: true,
      view_operations: true,
      view_finance: true,
      view_inventory: true,
    },
  },
  {
    id: "sales_staff",
    label: "Sales Staff",
    category: "Sales",
    permissions: {
      access_pos: true,
      view_operations: true,
      view_inventory: true,
    },
  },
  {
    id: "warehouse_manager",
    label: "Warehouse Manager",
    category: "Warehouse",
    permissions: {
      modify_inventory: true,
      view_operations: true,
      view_inventory: true,
      export_reports: true,
    },
  },
  {
    id: "warehouse_clerk",
    label: "Warehouse Clerk",
    category: "Warehouse",
    permissions: {
      modify_inventory: true,
      view_inventory: true,
      view_operations: true,
    },
  },
  {
    id: "finance_manager",
    label: "Finance Manager",
    category: "Finance",
    permissions: {
      access_hr: true,
      execute_payroll: true,
      view_general_ledger: true,
      modify_general_ledger: true,
      view_finance: true,
      export_reports: true,
      view_operations: true,
      view_inventory: true,
    },
  },
  {
    id: "finance_staff",
    label: "Finance Staff",
    category: "Finance",
    permissions: {
      access_hr: true,
      view_general_ledger: true,
      view_finance: true,
      export_reports: true,
      view_operations: true,
      view_inventory: true,
    },
  },
  {
    id: "hr_manager",
    label: "HR Manager",
    category: "HR / Payroll",
    permissions: {
      access_hr: true,
      execute_payroll: true,
      export_reports: true,
      view_operations: true,
    },
  },
  {
    id: "hr_staff",
    label: "HR Staff",
    category: "HR / Payroll",
    permissions: {
      access_hr: true,
      export_reports: true,
      view_operations: true,
    },
  },
  {
    id: "auditor",
    label: "Auditor",
    category: "Compliance",
    permissions: {
      view_general_ledger: true,
      view_finance: true,
      view_operations: true,
      view_inventory: true,
      export_reports: true,
    },
  },
];

/** Maps legacy User.role strings to enterprise OrgRole ids. */
const LEGACY_ROLE_MAP: Record<string, string> = {
  admin: "admin",
  finance: "finance_staff",
  hr: "hr_staff",
  sales: "sales_staff",
  purchasing: "warehouse_manager",
  warehouse: "warehouse_clerk",
};

function emptyPermissions(): PermissionMap {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as PermissionMap;
}

function roleRowToMap(role: OrgRole): PermissionMap {
  return {
    access_hr: role.accessHr,
    execute_payroll: role.executePayroll,
    view_general_ledger: role.viewGeneralLedger,
    modify_general_ledger: role.modifyGeneralLedger,
    modify_inventory: role.modifyInventory,
    access_pos: role.accessPos,
    export_reports: role.exportReports,
    manage_users: role.manageUsers,
    view_operations: role.viewOperations,
    view_finance: role.viewFinance,
    view_inventory: role.viewInventory,
  };
}

function mapToRoleData(orgId: string, seed: RoleSeed) {
  const base = emptyPermissions();
  const merged = { ...base, ...seed.permissions };
  return {
    id: seed.id,
    orgId,
    label: seed.label,
    category: seed.category,
    accessHr: merged.access_hr,
    executePayroll: merged.execute_payroll,
    viewGeneralLedger: merged.view_general_ledger,
    modifyGeneralLedger: merged.modify_general_ledger,
    modifyInventory: merged.modify_inventory,
    accessPos: merged.access_pos,
    exportReports: merged.export_reports,
    manageUsers: merged.manage_users,
    viewOperations: merged.view_operations,
    viewFinance: merged.view_finance,
    viewInventory: merged.view_inventory,
  };
}

export async function ensureOrgRoles(orgId = ORG_DEFAULT): Promise<void> {
  const db = getPrisma();
  for (const seed of ENTERPRISE_ROLE_SEEDS) {
    const data = mapToRoleData(orgId, seed);
    await db.orgRole.upsert({
      where: { orgId_id: { orgId, id: seed.id } },
      create: data,
      update: {
        label: data.label,
        category: data.category,
        accessHr: data.accessHr,
        executePayroll: data.executePayroll,
        viewGeneralLedger: data.viewGeneralLedger,
        modifyGeneralLedger: data.modifyGeneralLedger,
        modifyInventory: data.modifyInventory,
        accessPos: data.accessPos,
        exportReports: data.exportReports,
        manageUsers: data.manageUsers,
        viewOperations: data.viewOperations,
        viewFinance: data.viewFinance,
        viewInventory: data.viewInventory,
      },
    });
  }
  logger.info("OrgRole templates ensured", { count: ENTERPRISE_ROLE_SEEDS.length });
}

export function normalizeRoleKey(roleKey: string): string {
  return LEGACY_ROLE_MAP[roleKey] ?? roleKey;
}

export async function getRolePermissions(
  roleKey: string,
  orgId = ORG_DEFAULT,
): Promise<PermissionMap> {
  const db = getPrisma();
  const id = normalizeRoleKey(roleKey);
  const role = await db.orgRole.findUnique({ where: { orgId_id: { orgId, id } } });
  if (!role) return emptyPermissions();
  return roleRowToMap(role);
}

export function parseOverrideJson(raw: string | null | undefined): Partial<PermissionMap> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<PermissionMap>;
    const out: Partial<PermissionMap> = {};
    for (const key of PERMISSION_KEYS) {
      if (typeof parsed[key] === "boolean") out[key] = parsed[key];
    }
    return out;
  } catch {
    return {};
  }
}

export async function resolveUserPermissions(
  user: Pick<User, "role" | "permissionsOverride" | "orgId">,
): Promise<PermissionMap> {
  const base = await getRolePermissions(user.role, user.orgId);
  const overrides = parseOverrideJson(user.permissionsOverride);
  return { ...base, ...overrides };
}

export async function listOrgRoles(orgId = ORG_DEFAULT) {
  await ensureOrgRoles(orgId);
  const db = getPrisma();
  const rows = await db.orgRole.findMany({ where: { orgId }, orderBy: { label: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    category: r.category,
    permissions: roleRowToMap(r),
  }));
}

export async function updateOrgRolePermissions(
  roleId: string,
  permissions: Partial<PermissionMap>,
  orgId = ORG_DEFAULT,
): Promise<void> {
  const db = getPrisma();
  const existing = await db.orgRole.findUnique({ where: { orgId_id: { orgId, id: roleId } } });
  if (!existing) throw new Error(`Role not found: ${roleId}`);
  if (roleId === "admin") throw new Error("Admin role permissions cannot be modified.");

  const current = roleRowToMap(existing);
  const merged = { ...current, ...permissions };

  await db.orgRole.update({
    where: { orgId_id: { orgId, id: roleId } },
    data: {
      accessHr: merged.access_hr,
      executePayroll: merged.execute_payroll,
      viewGeneralLedger: merged.view_general_ledger,
      modifyGeneralLedger: merged.modify_general_ledger,
      modifyInventory: merged.modify_inventory,
      accessPos: merged.access_pos,
      exportReports: merged.export_reports,
      manageUsers: merged.manage_users,
      viewOperations: merged.view_operations,
      viewFinance: merged.view_finance,
      viewInventory: merged.view_inventory,
    },
  });
}

export async function assignUserRole(
  userId: string,
  roleId: string,
  permissionsOverride?: Partial<PermissionMap> | null,
): Promise<void> {
  const db = getPrisma();
  const updated = await db.user.updateMany({
    where: { id: userId },
    data: {
      role: normalizeRoleKey(roleId),
      permissionsOverride:
        permissionsOverride === null
          ? null
          : permissionsOverride
            ? JSON.stringify(permissionsOverride)
            : undefined,
    },
  });
  if (updated.count === 0) {
    throw new Error(`User not found: ${userId}`);
  }
}

export type CreateUserWithRoleInput = {
  username: string;
  passwordHash: string;
  displayName: string;
  orgId: string;
  roleId: string;
  permissionsOverride?: Partial<PermissionMap> | null;
  mustChangePassword?: boolean;
  employeeId?: string | null;
};

/**
 * Atomic user provisioning — insert + role assignment in one transaction so
 * db.user.update() never runs against a row that is not yet committed.
 */
export async function createUserWithRole(input: CreateUserWithRoleInput): Promise<{ userId: string }> {
  const db = getPrisma();
  const username = input.username.trim().toLowerCase();
  const orgId = input.orgId.trim() || ORG_DEFAULT;
  const roleId = normalizeRoleKey(input.roleId);
  const displayName = input.displayName.trim() || username;

  await ensureOrgRoles(orgId);
  const roleRow = await db.orgRole.findUnique({
    where: { orgId_id: { orgId, id: roleId } },
  });
  if (!roleRow) throw new Error(`Unknown enterprise role: ${roleId}`);

  const permissionsOverrideJson =
    input.permissionsOverride === null
      ? null
      : input.permissionsOverride
        ? JSON.stringify(input.permissionsOverride)
        : null;

  const employeeId = input.employeeId?.trim() || null;

  const user = await db.$transaction(async (tx) => {
    if (employeeId) {
      const emp = await tx.employee.findUnique({ where: { id: employeeId } });
      if (!emp) throw new Error(`Employee not found: ${employeeId}`);
      const taken = await tx.user.findUnique({ where: { employeeId } });
      if (taken) throw new Error("That employee is already linked to another user account.");
    }

    const created = await tx.user.create({
      data: {
        username,
        passwordHash: input.passwordHash,
        displayName,
        orgId,
        role: "user",
        mustChangePassword: input.mustChangePassword ?? true,
        isActive: true,
        employeeId,
      },
    });

    await tx.user.update({
      where: { id: created.id },
      data: {
        role: roleId,
        permissionsOverride: permissionsOverrideJson,
      },
    });

    return created;
  });

  return { userId: user.id };
}

export function hasPermission(map: PermissionMap, key: PermissionKey): boolean {
  return !!map[key];
}

export async function assertUserPermission(
  userId: string,
  key: PermissionKey,
): Promise<void> {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new Error("Unauthorized.");
  const perms = await resolveUserPermissions(user);
  if (!hasPermission(perms, key)) {
    throw new Error(`Permission denied: ${key}`);
  }
}

/** HR/Payroll IPC gate — Admin, HR, or Finance only (blocks Sales/Warehouse profiles). */
export async function assertHrPayrollAccess(
  token: string | null | undefined,
): Promise<{ userId: string; permissions: PermissionMap; role: string }> {
  if (!token) throw new Error("Authentication required.");
  if (isPresenterBypassToken(token)) return presenterBypassAuthContext();
  const db = getPrisma();
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || row.expiresAt < new Date() || !row.user.isActive) {
    throw new Error("Session expired or invalid.");
  }
  const permissions = await resolveUserPermissions(row.user);
  const role = normalizeRoleKey(row.user.role);

  if (permissions.manage_users || permissions.access_hr || permissions.view_finance) {
    return { userId: row.user.id, permissions, role };
  }
  if (role === "finance_manager" || role === "hr_manager") {
    return { userId: row.user.id, permissions, role };
  }

  throw new Error(
    "Permission denied: HR/Payroll data requires Admin, HR access, or Finance privileges.",
  );
}

/** User Administration may list active employees for account linking (manage_users). */
export async function assertHrPayrollOrUserAdmin(
  token: string | null | undefined,
): Promise<{ userId: string; permissions: PermissionMap; role: string }> {
  try {
    const ctx = await assertTokenPermission(token, "manage_users");
    const db = getPrisma();
    const { createHash } = await import("node:crypto");
    const tokenHash = createHash("sha256").update(token!).digest("hex");
    const row = await db.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const role = row ? normalizeRoleKey(row.user.role) : "admin";
    return { userId: ctx.userId, permissions: ctx.permissions, role };
  } catch {
    return assertHrPayrollAccess(token);
  }
}

export async function assertTokenPermission(
  token: string | null | undefined,
  key: PermissionKey,
): Promise<{ userId: string; permissions: PermissionMap }> {
  if (!token) throw new Error("Authentication required.");
  if (isPresenterBypassToken(token)) {
    const ctx = presenterBypassAuthContext();
    if (!hasPermission(ctx.permissions, key)) {
      throw new Error(`Permission denied: ${key}`);
    }
    return { userId: ctx.userId, permissions: ctx.permissions };
  }
  const db = getPrisma();
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || row.expiresAt < new Date() || !row.user.isActive) {
    throw new Error("Session expired or invalid.");
  }
  const permissions = await resolveUserPermissions(row.user);
  if (!hasPermission(permissions, key)) {
    throw new Error(`Permission denied: ${key}`);
  }
  return { userId: row.user.id, permissions };
}
