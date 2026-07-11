import type { ReactNode } from "react";
import { formatMoneyLocale, formatNumberLocale } from "@/lib/locale-format";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Dashboard / KPI accent roles — enterprise ERP color conventions. */
export type KpiAccent = "financial" | "operational" | "revenue" | "yield" | "neutral";

const kpiAccentStyles: Record<
  KpiAccent,
  { card: string; label: string; value: string }
> = {
  financial: {
    card: "border-border border-l-4 border-l-erp-financial bg-erp-financial/10",
    label: "text-erp-financial",
    value: "text-erp-financial",
  },
  operational: {
    card: "border-border border-l-4 border-l-brand bg-brand/5",
    label: "text-brand",
    value: "text-foreground",
  },
  revenue: {
    card: "border-border border-l-4 border-l-success bg-success/10",
    label: "text-[oklch(0.42_0.12_152)]",
    value: "text-[oklch(0.38_0.14_152)]",
  },
  yield: {
    card: "border-border border-l-4 border-l-[oklch(0.58_0.14_195)] bg-[oklch(0.58_0.14_195)]/10",
    label: "text-[oklch(0.45_0.12_195)]",
    value: "text-[oklch(0.38_0.14_195)]",
  },
  neutral: {
    card: "border-border bg-card",
    label: "text-muted-foreground",
    value: "text-foreground",
  },
};

/** Responsive KPI grid — prevents card overflow on narrow viewports. */
export function KpiGrid({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 | 6 }) {
  const colClass =
    columns === 6
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"
      : columns === 3
        ? "grid-cols-2 lg:grid-cols-3"
        : columns === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-2 lg:grid-cols-4";
  return <div className={`grid gap-3 ${colClass}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  accent = "neutral",
}: {
  label: string;
  value: string;
  delta?: string;
  hint?: string;
  accent?: KpiAccent;
}) {
  const positive = delta?.startsWith("+");
  const tone = kpiAccentStyles[accent];
  return (
    <div className={`min-w-0 overflow-hidden rounded-lg border p-4 ${tone.card}`}>
      <div className={`truncate text-xs font-semibold uppercase tracking-wider ${tone.label}`} title={label}>
        {label}
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <div
          className={`min-w-0 max-w-full truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${tone.value}`}
          title={value}
        >
          {value}
        </div>
        {delta && (
          <span
            className={`shrink-0 truncate text-xs font-medium ${
              positive ? "text-success" : delta.startsWith("-") ? "text-danger" : "text-muted-foreground"
            }`}
            title={delta}
          >
            {delta}
          </span>
        )}
      </div>
      {hint && (
        <div className="mt-1 truncate text-xs text-muted-foreground" title={hint}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  padded = true,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      {title && (
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {actions}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "brand";
}) {
  const map = {
    neutral: "bg-surface-2 text-muted-foreground border-border",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-[oklch(0.45_0.12_75)] border-warning/30",
    danger: "bg-danger/10 text-danger border-danger/20",
    brand: "bg-brand/10 text-brand border-brand/20",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

export function fmtMoney(n: number) {
  return formatMoneyLocale(n);
}
export function fmtNum(n: number) {
  return formatNumberLocale(n);
}

/** Enterprise ERP control classes — use consistently across modules. */
export const erp = {
  actionBtn:
    "inline-flex items-center justify-center rounded-md bg-erp-action px-3 py-1.5 text-xs font-medium text-erp-action-fg transition-colors hover:opacity-90 disabled:opacity-50",
  secondaryBtn:
    "inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50",
  financial:
    "tabular-nums font-medium text-erp-financial",
  total: "tabular-nums text-sm font-semibold text-erp-total",
  warning: "text-erp-warning",
  input:
    "h-8 w-full rounded-md border border-border bg-erp-input px-2.5 text-sm outline-none transition-colors focus:border-brand disabled:cursor-not-allowed disabled:opacity-50",
  readonly:
    "rounded-md border border-border bg-erp-readonly px-2.5 py-1.5 text-sm text-muted-foreground",
  status: "text-erp-status",
} as const;

export function ErpFieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{children}</span>;
}
