import { Link } from "@tanstack/react-router";
import { BadgeDollarSign, CheckCircle2, Clock, Users } from "lucide-react";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-foreground shadow">
        {n}
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function GuideBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** HR & Payroll user guide — appended under Support → Help. */
export function HrPayrollHelpGuides() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-brand/10 via-surface to-background p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-brand-foreground">
            <BadgeDollarSign className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">HR &amp; Payroll Guide</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage employees, approve time worked, and post payroll accruals to the General Ledger from the{" "}
              <strong>HR / Payroll</strong> section in the sidebar (above Administration).
            </p>
          </div>
        </div>
      </div>

      <GuideBlock title="Add employees (W-2 vs 1099)">
        <Step n={1} title="Open Employees">
          Sidebar → <strong>HR / Payroll</strong> → <Link to="/hr-employees" className="text-brand underline">Employees</Link>.
        </Step>
        <Step n={2} title="Choose tax classification">
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>W2</strong> — Employee on payroll; Benben applies a simplified combined withholding rate
              (federal + FICA placeholder) when calculating payroll.
            </li>
            <li>
              <strong>1099</strong> — Independent contractor; no employer withholding in this release (contractor remits
              their own taxes).
            </li>
          </ul>
        </Step>
        <Step n={3} title="Set base wage (hourly)">
          Enter the hourly rate used to multiply approved hours on timecards. Status defaults to{" "}
          <span className="font-mono text-xs">ACTIVE</span>.
        </Step>
        <Step n={4} title="Save">
          Click <strong>Add employee</strong>. The record is stored in your local PostgreSQL database via the desktop app.
        </Step>
      </GuideBlock>

      <GuideBlock title="Log and approve timecards">
        <Step n={1} title="Open Timecards">
          <Link to="/hr-timecards" className="inline-flex items-center gap-1 text-brand underline">
            <Clock className="h-4 w-4" /> Timecards
          </Link>
        </Step>
        <Step n={2} title="Log a shift">
          Select an employee, set <strong>Clock in</strong> and optional <strong>Clock out</strong>. Hours are computed
          automatically when clock-out is provided, or enter <strong>Total hours</strong> directly.
        </Step>
        <Step n={3} title="Approve for payroll">
          Only <strong>approved</strong> timecards within a payroll period are included in a run. Use{" "}
          <strong>Approve</strong> on each row before finalizing payroll.
        </Step>
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>Unapproved timecards are ignored during payroll calculation.</span>
        </div>
      </GuideBlock>

      <GuideBlock title="Finalize a payroll run → General Ledger accrual">
        <Step n={1} title="Create a payroll run">
          On <Link to="/hr-payroll-runs" className="text-brand underline">Payroll Runs</Link>, set the period start and
          end dates, then <strong>Create run</strong>.
        </Step>
        <Step n={2} title="Calculate (optional preview)">
          <strong>Calculate</strong> aggregates approved timecards, applies wage rates and withholding, and updates
          gross, deductions, and net on the run — without posting to the ledger.
        </Step>
        <Step n={3} title="Finalize & post">
          <strong>Finalize &amp; post to GL</strong> calculates totals, marks the run processed, and creates a balanced
          journal entry through the existing double-entry engine:
        </Step>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed">
{`Debit  6300  Wages Expense
Credit 2050  Payroll Liability   (gross pay)`}
        </pre>
        <p className="text-sm text-muted-foreground">
          View the entry under{" "}
          <Link to="/accounting" className="font-medium text-brand underline">
            General Ledger
          </Link>{" "}
          with source <span className="font-mono">PAYROLL</span>. Duplicate finalize attempts are blocked by the
          idempotency fingerprint.
        </p>
      </GuideBlock>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        HR / Payroll requires the Benben desktop app — browser-only mode cannot reach the local database.
      </div>
    </div>
  );
}
