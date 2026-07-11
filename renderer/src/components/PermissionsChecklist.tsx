import type { PermissionMap, PermissionKey } from "@/lib/permissions-constants";

const PERMISSION_ORDER: { key: PermissionKey; label: string }[] = [
  { key: "manage_users", label: "User administration" },
  { key: "access_hr", label: "HR / Payroll module" },
  { key: "execute_payroll", label: "Execute payroll & GL accruals" },
  { key: "view_general_ledger", label: "View General Ledger" },
  { key: "modify_general_ledger", label: "Modify / post journal entries" },
  { key: "view_finance", label: "View finance (AR/AP)" },
  { key: "view_operations", label: "View operations modules" },
  { key: "view_inventory", label: "View inventory (read-only)" },
  { key: "modify_inventory", label: "Modify inventory & WIP" },
  { key: "access_pos", label: "Point of Sale" },
  { key: "export_reports", label: "Print & export reports" },
];

type Props = {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  disabled?: boolean;
  readOnly?: boolean;
};

export function PermissionsChecklist({ value, onChange, disabled, readOnly }: Props) {
  function toggle(key: PermissionKey) {
    if (disabled || readOnly) return;
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PERMISSION_ORDER.map(({ key, label }) => (
        <label
          key={key}
          className={`flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm ${
            value[key] ? "bg-brand/5" : "bg-surface/40"
          } ${disabled || readOnly ? "opacity-60 cursor-default" : "hover:bg-surface"}`}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!value[key]}
            disabled={disabled || readOnly}
            onChange={() => toggle(key)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
