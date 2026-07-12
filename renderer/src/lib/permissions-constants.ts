/**
 * Leaf-node permission definitions — no imports from rbac, auth-store, or permissions-store.
 */

export type PermissionKey =
  | "access_hr"
  | "execute_payroll"
  | "view_general_ledger"
  | "modify_general_ledger"
  | "modify_inventory"
  | "access_pos"
  | "export_reports"
  | "manage_users"
  | "view_operations"
  | "view_finance"
  | "view_inventory";

export type PermissionMap = Record<PermissionKey, boolean>;

export type Role = string;

export const PERMISSION_KEYS: PermissionKey[] = [
  "access_hr",
  "execute_payroll",
  "view_general_ledger",
  "modify_general_ledger",
  "modify_inventory",
  "access_pos",
  "export_reports",
  "manage_users",
  "view_operations",
  "view_finance",
  "view_inventory",
];

export const ALL_FALSE_PERMISSIONS: PermissionMap = {
  access_hr: false,
  execute_payroll: false,
  view_general_ledger: false,
  modify_general_ledger: false,
  modify_inventory: false,
  access_pos: false,
  export_reports: false,
  manage_users: false,
  view_operations: false,
  view_finance: false,
  view_inventory: false,
};

export const ADMIN_ALL_PERMISSIONS: PermissionMap = {
  access_hr: true,
  execute_payroll: true,
  view_general_ledger: true,
  modify_general_ledger: true,
  modify_inventory: true,
  access_pos: true,
  export_reports: true,
  manage_users: true,
  view_operations: true,
  view_finance: true,
  view_inventory: true,
};

export const ENTERPRISE_ROLES: {
  id: string;
  label: string;
  category: string;
  blurb: string;
}[] = [
  { id: "admin", label: "Admin", category: "Administration", blurb: "Full system access." },
  { id: "sales_manager", label: "Sales Manager", category: "Sales", blurb: "POS, CRM, operational visibility." },
  { id: "sales_staff", label: "Sales Staff", category: "Sales", blurb: "POS and read-only operations." },
  { id: "warehouse_manager", label: "Warehouse Manager", category: "Warehouse", blurb: "Inventory & WIP control." },
  { id: "warehouse_clerk", label: "Warehouse Clerk", category: "Warehouse", blurb: "Inventory transactions." },
  { id: "finance_manager", label: "Finance Manager", category: "Finance", blurb: "GL, AR/AP, payroll execution." },
  { id: "finance_staff", label: "Finance Staff", category: "Finance", blurb: "Finance read & reporting." },
  { id: "hr_manager", label: "HR Manager", category: "HR / Payroll", blurb: "Employees, timecards, payroll runs & configuration." },
  { id: "hr_staff", label: "HR Staff", category: "HR / Payroll", blurb: "HR records, timecards, and employee onboarding." },
  {
    id: "auditor",
    label: "Auditor",
    category: "Compliance",
    blurb: "Read-only across finance, operations, and inventory.",
  },
];

/** @deprecated Use ENTERPRISE_ROLES — kept for imports that expect ROLES. */
export const ROLES = ENTERPRISE_ROLES.map((r) => ({
  id: r.id as Role,
  label: r.label,
  blurb: r.blurb,
}));

/** Route path → required permission(s); any match grants access. */
export const ROUTE_PERMISSIONS: Record<string, PermissionKey | PermissionKey[]> = {
  "/": ["view_operations", "view_finance", "access_pos"],
  "/manufacturing": ["view_operations", "modify_inventory"],
  "/purchasing": ["view_operations", "modify_inventory"],
  "/supply-chain": ["view_operations", "view_inventory", "modify_inventory"],
  "/inventory": ["view_inventory", "modify_inventory"],
  "/imports": ["view_operations", "modify_inventory"],
  "/blind-spot-vault": ["view_operations", "modify_inventory"],
  "/pos": ["access_pos"],
  "/finance-workspace": ["view_finance", "view_general_ledger"],
  "/finance-reports": ["view_finance", "export_reports"],
  "/accounting": ["view_general_ledger"],
  "/ar": ["view_finance"],
  "/ap": ["view_finance"],
  "/finance-po-approvals": ["view_finance"],
  "/sales-invoicing": ["view_finance"],
  "/finance-bank": ["view_finance", "view_general_ledger"],
  "/finance-assets": ["view_finance"],
  "/finance-budgets": ["view_finance"],
  "/finance-tax": ["view_finance"],
  "/finance-currency": ["view_finance"],
  "/customer-ledger": ["view_finance"],
  "/vendor-ledger": ["view_finance"],
  "/customer-360": ["view_finance"],
  "/crm": ["access_pos", "view_finance"],
  "/hr-employees": ["access_hr"],
  "/hr-timecards": ["access_hr"],
  "/hr-payroll-runs": ["access_hr"],
  "/hr-payroll-config": ["access_hr", "execute_payroll"],
  "/import": ["view_operations"],
  "/data-import": ["view_operations"],
  "/locations": ["manage_users"],
  "/settings": ["view_operations", "view_finance", "access_pos", "manage_users"],
  "/help": ["view_operations"],
  "/activity-log": ["view_finance", "manage_users"],
  "/users": ["manage_users"],
};

/**
 * BSL 1.1 Enterprise Use Restriction (see LICENSE.md):
 * Manufacturing, Imports, Finance (incl. advanced ledger), and HR / Payroll.
 * Free Core (CRM, POS, Inventory, Supply Chain, Purchasing) is intentionally omitted.
 */
export const ENTERPRISE_ROUTES = new Set<string>([
  "/manufacturing",
  "/imports",
  // Finance (all finance / ledger screens)
  "/finance-workspace",
  "/finance-reports",
  "/accounting",
  "/finance-rev-rec",
  "/customer-360",
  "/ar",
  "/customer-ledger",
  "/ap",
  "/finance-po-approvals",
  "/vendor-ledger",
  "/sales-invoicing",
  "/finance-bank",
  "/finance-assets",
  "/finance-budgets",
  "/finance-tax",
  "/finance-currency",
  // HR / Payroll
  "/hr-employees",
  "/hr-timecards",
  "/hr-payroll-runs",
  "/hr-payroll-config",
]);

/** True when `path` is a BSL-restricted Enterprise module route. */
export function isEnterpriseRoute(path: string): boolean {
  const normalized = (path.split("?")[0] ?? path).split("#")[0]?.replace(/\/+$/, "") || "/";
  return ENTERPRISE_ROUTES.has(normalized);
}

/** Preserved baseline paths — same keys as before for compatibility. */
export const MODULE_ACCESS: Record<string, Role[]> = Object.fromEntries(
  Object.keys(ROUTE_PERMISSIONS).map((path) => [path, ["admin"] as Role[]]),
);
