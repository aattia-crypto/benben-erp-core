/**
 * Maps HR employee job designations to enterprise OrgRole ids (leaf — no store/rbac imports).
 */
import type { Role } from "./permissions-constants";

/** Ordered rules — first match wins. */
const JOB_TITLE_RULES: { match: (normalized: string) => boolean; roleId: Role }[] = [
  {
    match: (t) => /\b(admin|administrator|it admin)\b/.test(t),
    roleId: "admin",
  },
  {
    match: (t) => /\b(finance manager|controller|cfo)\b/.test(t),
    roleId: "finance_manager",
  },
  {
    match: (t) => /\b(payroll manager)\b/.test(t),
    roleId: "hr_manager",
  },
  {
    match: (t) => /\b(hr manager|human resources manager|people ops manager|hr director)\b/.test(t),
    roleId: "hr_manager",
  },
  {
    match: (t) =>
      /\b(hr staff|hr coordinator|hr generalist|human resources|people ops|payroll clerk|recruiter)\b/.test(
        t,
      ),
    roleId: "hr_staff",
  },
  {
    match: (t) =>
      /\b(finance|accountant|bookkeeper|accounts payable|accounts receivable)\b/.test(t),
    roleId: "finance_staff",
  },
  {
    match: (t) => /\b(auditor|audit|compliance)\b/.test(t),
    roleId: "auditor",
  },
  {
    match: (t) => /\b(sales manager|regional sales|store manager)\b/.test(t),
    roleId: "sales_manager",
  },
  {
    match: (t) => /\b(sales|cashier|retail|pos)\b/.test(t),
    roleId: "sales_staff",
  },
  {
    match: (t) => /\b(warehouse manager|logistics manager|distribution manager)\b/.test(t),
    roleId: "warehouse_manager",
  },
  {
    match: (t) => /\b(warehouse|stock|picker|forklift|inventory clerk)\b/.test(t),
    roleId: "warehouse_clerk",
  },
];

const EXACT_TITLE_MAP: Record<string, Role> = {
  "finance manager": "finance_manager",
  "finance staff": "finance_staff",
  "hr manager": "hr_manager",
  "human resources manager": "hr_manager",
  "hr staff": "hr_staff",
  "human resources staff": "hr_staff",
  "payroll manager": "hr_manager",
  "payroll clerk": "hr_staff",
  "sales manager": "sales_manager",
  "sales staff": "sales_staff",
  "sales associate": "sales_staff",
  "warehouse manager": "warehouse_manager",
  "warehouse clerk": "warehouse_clerk",
  "warehouse associate": "warehouse_clerk",
  auditor: "auditor",
  admin: "admin",
  administrator: "admin",
};

/** Common job titles shown when provisioning system users (Administration → User Management). */
export const PROVISION_JOB_TITLES: { label: string; roleId: Role }[] = [
  { label: "HR Manager", roleId: "hr_manager" },
  { label: "HR Staff", roleId: "hr_staff" },
  { label: "Payroll Manager", roleId: "hr_manager" },
  { label: "Payroll Clerk", roleId: "hr_staff" },
  { label: "Finance Manager", roleId: "finance_manager" },
  { label: "Finance Staff", roleId: "finance_staff" },
  { label: "Sales Manager", roleId: "sales_manager" },
  { label: "Sales Staff", roleId: "sales_staff" },
  { label: "Warehouse Manager", roleId: "warehouse_manager" },
  { label: "Warehouse Clerk", roleId: "warehouse_clerk" },
  { label: "Auditor", roleId: "auditor" },
];

const DEPARTMENT_DEFAULT_ROLE: Record<string, Role> = {
  admin: "admin",
  sales: "sales_staff",
  finance: "finance_staff",
  hr: "hr_staff",
  purchasing: "warehouse_manager",
  warehouse: "warehouse_clerk",
  inventory: "warehouse_clerk",
  operations: "warehouse_clerk",
};

/** Default enterprise role when provisioning by departmental assignment. */
export function defaultRoleForDepartment(department: string): Role {
  return DEPARTMENT_DEFAULT_ROLE[department.trim().toLowerCase()] ?? "warehouse_clerk";
}

/**
 * Resolve enterprise role id from HR job title / classification fields.
 */
export function mapEmployeeJobToEnterpriseRole(input: {
  jobTitle?: string | null;
  taxClassification?: string | null;
  status?: string | null;
}): Role {
  const title = (input.jobTitle ?? "").trim().toLowerCase();
  const tax = (input.taxClassification ?? "").trim().toLowerCase();

  if (title && EXACT_TITLE_MAP[title]) return EXACT_TITLE_MAP[title];

  if (title) {
    for (const rule of JOB_TITLE_RULES) {
      if (rule.match(title)) return rule.roleId;
    }
  }

  if (tax === "1099" || tax.includes("1099")) return "sales_staff";

  return "warehouse_clerk";
}
