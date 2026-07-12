import { Link } from "@tanstack/react-router";
import { Lock, ShieldCheck } from "lucide-react";

type Props = {
  /** Optional module label for the message (e.g. "Finance"). */
  moduleLabel?: string;
};

/** Shown when an enterprise route is opened without an active license or trial. */
export function PremiumActivationRequired({ moduleLabel }: Props) {
  const subject = moduleLabel ? `${moduleLabel} is` : "This Enterprise module is";

  return (
    <div className="mx-auto max-w-lg rounded-md border border-brand/30 bg-brand/5 p-6 text-sm">
      <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
        <Lock className="h-4 w-4 text-brand" aria-hidden />
        Premium Activation Required
      </div>
      <p className="mb-4 text-muted-foreground">
        {subject} part of the Enterprise tier (Manufacturing, Imports, Finance, and HR / Payroll). Activate a
        license or start your trial to unlock it. Core modules - Inventory, Purchasing, Supply Chain, POS, and
        CRM - remain available under your current departmental access.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/activate"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand/90"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Activate license
        </Link>
        <Link
          to="/settings"
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          Open Settings - Licensing
        </Link>
      </div>
    </div>
  );
}