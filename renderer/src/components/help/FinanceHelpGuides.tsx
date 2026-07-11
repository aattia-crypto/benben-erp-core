import { Panel } from "@/components/ui-bits";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FinanceHelpGuides() {
  return (
    <div className="space-y-4">
      <Panel title="General Ledger">
        <p className="text-sm text-muted-foreground">
          The GL is your book of record. Every invoice, payment, and adjustment posts journal lines that
          debit and credit accounts. Use <strong>Journal</strong> to review entries, <strong>Trial Balance</strong>{" "}
          to confirm debits equal credits, and <strong>Chart</strong> to browse account balances. When the
          header shows <em>Source: database</em>, numbers come from your local PostgreSQL database and survive restarts.
        </p>
      </Panel>

      <Accordion type="single" collapsible className="rounded-xl border border-border bg-card px-4">
        <AccordionItem value="wip-rev-rec">
          <AccordionTrigger>WIP capitalization & milestone revenue recognition (moving off QBO)</AccordionTrigger>
          <AccordionContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              BenBen replaces spreadsheet-and-QBO workarounds with integrated manufacturing and contract
              accounting. Two system accounts anchor the flow: <strong>1210 Work-In-Process</strong> (asset) and{" "}
              <strong>2200 Deferred Revenue</strong> (liability).
            </p>
            <div>
              <p className="mb-1 font-medium text-foreground">WIP capitalization (1210)</p>
              <p>
                When labor or materials are logged on a production batch in <strong>Manufacturing & WIP</strong>,
                the finance API posts a balanced journal entry via ledger integrity checks:{" "}
                <em>Debit 1210 WIP · Credit 5000 COGS/expense</em> (or another expense account you specify).
                The operational <code className="text-xs">wipValue</code> on the batch and the GL 1210 balance
                move together so floor activity matches your books.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>View live WIP ledger balance on <strong>Rev Rec & WIP Ledger</strong> under Finance.</li>
                <li>Recent 1210 postings appear in the dashboard activity feed.</li>
                <li>Idempotency fingerprints prevent duplicate capitalization if a save is retried.</li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium text-foreground">Milestone revenue recognition (2200 → 4000)</p>
              <p>
                For fixed-price or milestone contracts, invoice cash may hit AR immediately while revenue should
                be recognized over deliverables. After billing, revenue is deferred to account <strong>2200</strong>.
                When a milestone is achieved, trigger recognition from the dashboard:{" "}
                <em>Debit 2200 Deferred Revenue · Credit 4000 Recognized Revenue</em>. Each trigger posts once —
                replays are blocked by the same integrity layer used for AR and AP.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Schedules track total, recognized, and remaining deferred amounts per contract.</li>
                <li>Milestones carry name, percentage, and dollar amount; status moves to COMPLETE when all fire.</li>
                <li>Compare schedule deferred totals with GL 2200 to reconcile before month-end close.</li>
              </ul>
            </div>
            <p>
              Unlike QuickBooks Online, all of this runs on your local PostgreSQL ledger — no sync lag, no
              third-party plugin. Export trial balance and P&amp;L from Finance Reports to hand off to your CPA
              with full audit trail in Activity Log.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Panel title="Bank reconciliation">
        <p className="text-sm text-muted-foreground">
          Import or enter bank transactions, then match them to GL cash activity. Green matches mean the
          bank and your books agree. Unmatched items usually mean a deposit in transit, an outstanding
          check, or a missing journal entry — resolve them before closing the month.
        </p>
      </Panel>
      <Panel title="Fixed assets & depreciation">
        <p className="text-sm text-muted-foreground">
          Register equipment and buildings as assets with useful life. Monthly depreciation moves cost from
          the balance sheet to expense automatically. The schedule shows remaining book value — use it for
          insurance and tax discussions, not as a substitute for your accountant&apos;s books.
        </p>
      </Panel>
      <Panel title="Budget vs actual">
        <p className="text-sm text-muted-foreground">
          Budget lines set what you planned to spend or earn. Actuals come from posted GL activity. Variance
          is the difference: positive on revenue means you beat plan; positive on expense means you overspent.
          Investigate large variances before leadership reviews.
        </p>
      </Panel>
      <Panel title="FX revaluation">
        <p className="text-sm text-muted-foreground">
          When you hold balances in foreign currency, revaluation restates them at today&apos;s rate. The
          system posts unrealized gain or loss to keep your balance sheet current. Realized gains/losses
          happen when you settle invoices or payments — revaluation only adjusts open balances.
        </p>
      </Panel>
    </div>
  );
}

export function ArApHelpGuides() {
  return (
    <div className="space-y-4">
      <Panel title="Invoice lifecycle (AR)">
        <p className="text-sm text-muted-foreground">
          Sales or POS on-account creates an open invoice: revenue is recognized and the customer balance
          increases. Status moves from <em>open</em> → <em>partial</em> → <em>paid</em> as cash is applied.
          Click <strong>Detail</strong> on any invoice to see GL impact, allocations, and credit memos.
        </p>
      </Panel>
      <Panel title="Payments & allocations">
        <p className="text-sm text-muted-foreground">
          A payment can cover one or many invoices. Each allocation ties cash to a specific invoice amount.
          Partial payments leave a remaining balance — the progress bar on the detail panel shows how much
          is still due. Unapplied cash means you received money without telling the system which invoice to
          clear.
        </p>
      </Panel>
      <Panel title="Credit memos & vendor credits">
        <p className="text-sm text-muted-foreground">
          AR credit memos reduce what a customer owes (returns, goodwill). AP vendor credits reduce what you
          owe a supplier. Both post reversing GL entries so AR/AP and revenue/expense stay in sync. Always
          enter a clear reason — auditors and collections teams rely on it.
        </p>
      </Panel>
      <Panel title="Aging reports">
        <p className="text-sm text-muted-foreground">
          Aging buckets group open balances by how late they are. Focus on 60+ and 90+ first for collections
          (AR) or cash planning (AP). Totals should match the open balance on the dashboard when data comes
          from the database.
        </p>
      </Panel>
    </div>
  );
}

export function CrmHelpGuides() {
  return (
    <div className="space-y-4">
      <Panel title="Pipeline">
        <p className="text-sm text-muted-foreground">
          Opportunities move through stages from lead to closed won/lost. Drag cards on the board or update
          stage in place. Expected revenue and probability help forecast — keep stages honest so reports
          mean something to sales leadership.
        </p>
      </Panel>
      <Panel title="Customer 360">
        <p className="text-sm text-muted-foreground">
          One screen for contact info, pipeline, AR balance, and a unified timeline. When the Finance API is
          running, timeline events (invoices, payments, credits) load from your local PostgreSQL database — not demo cache. CRM notes
          and tasks always appear alongside financial events in date order.
        </p>
      </Panel>
      <Panel title="Automation">
        <p className="text-sm text-muted-foreground">
          Built-in rules create follow-up tasks for overdue invoices, stale leads, and inactive accounts.
          Automation does not change your books — it only reminds your team to act. Review tasks on the CRM
          pipeline board regularly so nothing slips through.
        </p>
      </Panel>
    </div>
  );
}
