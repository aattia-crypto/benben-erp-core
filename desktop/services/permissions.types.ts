/** Canonical permission keys (stored on OrgRole + optional user overrides). */
export const PERMISSION_KEYS = [
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
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionMap = Record<PermissionKey, boolean>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  access_hr: "HR / Payroll module access",
  execute_payroll: "Execute payroll runs & post accruals",
  view_general_ledger: "View General Ledger (read-only)",
  modify_general_ledger: "Post / modify journal entries",
  modify_inventory: "Modify inventory & WIP",
  access_pos: "Point of Sale",
  export_reports: "Print & export reports",
  manage_users: "User administration",
  view_operations: "View operations modules",
  view_finance: "View finance modules (AR/AP)",
  view_inventory: "View inventory (read-only)",
};
