import { erp, ErpFieldLabel } from "@/components/ui-bits";
import type { PayType } from "@/lib/hr-bridge";

export type CreateEmployeeFormState = {
  name: string;
  jobTitle: string;
  payType: PayType;
  taxClassification: string;
  baseWage: string;
  status: string;
};

type Props = {
  value: CreateEmployeeFormState;
  onChange: (patch: Partial<CreateEmployeeFormState>) => void;
  onSubmit: (e: React.FormEvent) => void;
  wageLabel: string;
};

/** HR Create Employee form — blank job title & base wage; required pay type selector. */
export function CreateEmployeeDialog({ value, onChange, onSubmit, wageLabel }: Props) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
      <label className="block">
        <ErpFieldLabel>Name</ErpFieldLabel>
        <input
          className={`mt-1 ${erp.input}`}
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          required
        />
      </label>
      <label className="block">
        <ErpFieldLabel>Job title / classification</ErpFieldLabel>
        <input
          className={`mt-1 ${erp.input}`}
          value={value.jobTitle}
          onChange={(e) => onChange({ jobTitle: e.target.value })}
          placeholder="Enter corporate job title..."
          required
        />
      </label>
      <label className="block">
        <ErpFieldLabel>Pay type</ErpFieldLabel>
        <select
          className={`mt-1 ${erp.input}`}
          value={value.payType}
          onChange={(e) => onChange({ payType: e.target.value as PayType })}
          required
        >
          <option value="HOURLY">Hourly</option>
          <option value="SALARIED">Salaried</option>
        </select>
      </label>
      <label className="block">
        <ErpFieldLabel>Tax classification</ErpFieldLabel>
        <select
          className={`mt-1 ${erp.input}`}
          value={value.taxClassification}
          onChange={(e) => onChange({ taxClassification: e.target.value })}
        >
          <option value="W2">W2 — Employee</option>
          <option value="1099">1099 — Contractor</option>
        </select>
      </label>
      <label className="block">
        <ErpFieldLabel>{wageLabel}</ErpFieldLabel>
        <input
          className={`mt-1 ${erp.input}`}
          type="number"
          min={0.01}
          step="0.01"
          value={value.baseWage}
          onChange={(e) => onChange({ baseWage: e.target.value })}
          placeholder="0.00"
          required
        />
      </label>
      <label className="block">
        <ErpFieldLabel>Status</ErpFieldLabel>
        <input
          className={`mt-1 ${erp.input}`}
          value={value.status}
          onChange={(e) => onChange({ status: e.target.value })}
        />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className={erp.actionBtn}>
          Add employee
        </button>
      </div>
    </form>
  );
}

export const EMPTY_EMPLOYEE_FORM: CreateEmployeeFormState = {
  name: "",
  jobTitle: "",
  payType: "HOURLY",
  taxClassification: "W2",
  baseWage: "",
  status: "ACTIVE",
};
