import { Panel } from "@/components/ui-bits";

export function GettingStartedHelpGuides() {
  return (
    <div className="space-y-4">
      <Panel title="Getting started">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            On first launch, complete the <strong>setup wizard</strong> — company name, fiscal year, currency, and
            administrator password.
          </li>
          <li>
            Sign in with your administrator account. Invite additional users from Settings when you are ready.
          </li>
          <li>
            Open <strong>Finance Workspace</strong> to review cash, bank reconciliation, and budget variance.
          </li>
          <li>
            Use <strong>Accounts Receivable</strong> and <strong>Accounts Payable</strong> for customer invoices and
            vendor bills. When the header shows <em>Source: database</em>, data is stored in your local PostgreSQL database.
          </li>
          <li>
            Visit <strong>Help</strong> any time for module-specific walkthroughs.
          </li>
        </ol>
      </Panel>

      <Panel title="Accounting workflow overview">
        <p className="text-sm text-muted-foreground">
          Benben follows standard double-entry bookkeeping. Sales and purchases create journal entries automatically
          when posted from AR/AP. Use <strong>General Ledger</strong> to review journals, run trial balance, and export
          reports. Close each month only after bank reconciliation shows no unexplained differences.
        </p>
      </Panel>

      <Panel title="CRM workflow overview">
        <p className="text-sm text-muted-foreground">
          Add customers and vendors in <strong>CRM</strong>, log activities, and track opportunities on the pipeline
          board. <strong>Customer 360</strong> combines AR balance, opportunities, and timeline in one view — ideal
          before collection calls or account reviews.
        </p>
      </Panel>

      <Panel title="Backup & restore">
        <p className="text-sm text-muted-foreground">
          In <strong>Settings</strong>, use <em>Production backup</em> (desktop app) to copy your local PostgreSQL database and
          configuration to a timestamped folder. Create a backup before major upgrades or bulk imports. To restore,
          pick a backup, confirm the prompt, and restart Benben — your current database is copied aside first.
          Automated snapshots in Settings are separate lightweight exports; use production backup for full recovery.
        </p>
      </Panel>

      <Panel title="Report & PDF export">
        <p className="text-sm text-muted-foreground">
          List screens include CSV/Excel export via the export menu. For branded invoices, open an invoice in AR and
          click <strong>PDF</strong>. Company logo and footer are configured under Settings → Company branding. Financial
          report tables can export to PDF from the report toolbar where available.
        </p>
      </Panel>
    </div>
  );
}
