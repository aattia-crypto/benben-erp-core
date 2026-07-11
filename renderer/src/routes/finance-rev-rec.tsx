import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, StatCard, KpiGrid, fmtMoney, erp } from "@/components/ui-bits";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { financeApi, financeHealthCheck } from "@/lib/finance-api-client";
import type { RevRecScheduleRow, WipLedgerDashboard } from "@/lib/finance-api-types";
import { Factory, Landmark, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/finance-rev-rec")({
  head: () => ({
    meta: [{ title: "Revenue Recognition & WIP Ledger - Benben ERP" }],
  }),
  component: RevRecWipPage,
});

function RevRecWipPage() {
  const [schedules, setSchedules] = useState<RevRecScheduleRow[]>([]);
  const [summary, setSummary] = useState({
    scheduleDeferred: 0,
    scheduleRecognized: 0,
    deferredLedgerBalance: 0,
    activeSchedules: 0,
  });
  const [wip, setWip] = useState<WipLedgerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const ok = await financeHealthCheck();
      setApiOk(ok);
      if (!ok) {
        setSchedules([]);
        setWip(null);
        return;
      }
      const [revRec, wipData] = await Promise.all([financeApi.revRecDashboard(), financeApi.wipLedger()]);
      setSchedules(revRec.schedules);
      setSummary({
        scheduleDeferred: revRec.summary.scheduleDeferred,
        scheduleRecognized: revRec.summary.scheduleRecognized,
        deferredLedgerBalance: revRec.summary.deferredLedgerBalance,
        activeSchedules: revRec.summary.activeSchedules,
      });
      setWip(wipData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load rev-rec dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function triggerMilestone(milestoneId: string, name: string) {
    setTriggering(milestoneId);
    try {
      const result = await financeApi.triggerRevRecMilestone({
        milestoneId,
        idempotencyKey: `ui-rev-rec-${milestoneId}`,
      });
      if (result.duplicate) {
        toast.info(`"${name}" was already recognized.`);
      } else {
        toast.success(`Milestone "${name}" recognized (Dr 2200 / Cr 4000).`);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Milestone trigger failed.");
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue Recognition & WIP Ledger"
        subtitle="Milestone deferred revenue (2200 to 4000) and manufacturing WIP capitalization (1210)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {apiOk && <DataSourceBadge source="database" />}
            <Link to="/accounting" className={erp.secondaryBtn}>
              <Landmark className="mr-1.5 inline h-4 w-4" />
              General Ledger
            </Link>
            <Link to="/manufacturing" className={erp.secondaryBtn}>
              <Factory className="mr-1.5 inline h-4 w-4" />
              Manufacturing
            </Link>
            <button type="button" className={erp.secondaryBtn} onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading ledger balances...</p>
      ) : !apiOk ? (
        <Panel title="Finance API unavailable">
          <p className="text-sm text-muted-foreground">
            Start the Benben desktop app (<code className="text-xs">npm run dev</code>) to load live WIP and
            deferred revenue from PostgreSQL. If you are using browser-only UI dev (
            <code className="text-xs">npm run dev:ui</code>), also run{" "}
            <code className="text-xs">npm run dev:finance-api</code> in a second terminal.
          </p>
        </Panel>
      ) : (
        <>
          <KpiGrid columns={4}>
            <StatCard
              label="Deferred revenue (GL 2200)"
              value={fmtMoney(summary.deferredLedgerBalance)}
              hint="Unrecognized contract liability"
            />
            <StatCard
              label="Schedule deferred"
              value={fmtMoney(summary.scheduleDeferred)}
              hint={`${summary.activeSchedules} active schedule(s)`}
            />
            <StatCard label="Recognized to date" value={fmtMoney(summary.scheduleRecognized)} />
            <StatCard
              label="WIP asset (GL 1210)"
              value={fmtMoney(wip?.wipLedgerBalance ?? 0)}
              hint={`Ops batches: ${fmtMoney(wip?.operationalWipValue ?? 0)}`}
            />
          </KpiGrid>

          <Panel title="Milestone revenue recognition schedules" padded={false}>
            {schedules.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No rev-rec schedules yet. Demo seed creates a Helion milestone contract on first finance bootstrap.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Invoice</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                      <th className="px-4 py-2 text-right font-medium">Deferred</th>
                      <th className="px-4 py-2 text-right font-medium">Recognized</th>
                      <th className="px-4 py-2 font-medium">Milestones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((sch) => (
                      <tr key={sch.id} className="border-b border-border align-top">
                        <td className="px-4 py-3 font-mono text-xs">{sch.invoiceId?.slice(0, 10) ?? "-"}</td>
                        <td className="px-4 py-3">
                          <Pill tone={sch.status === "COMPLETE" ? "success" : "brand"}>{sch.status}</Pill>
                        </td>
                        <td className={`px-4 py-3 text-right ${erp.financial}`}>{fmtMoney(sch.totalAmount)}</td>
                        <td className={`px-4 py-3 text-right ${erp.financial}`}>{fmtMoney(sch.deferredAmount)}</td>
                        <td className={`px-4 py-3 text-right ${erp.financial}`}>{fmtMoney(sch.recognizedAmount)}</td>
                        <td className="px-4 py-3">
                          <ul className="space-y-2">
                            {sch.milestones.map((m) => (
                              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span>
                                  {m.milestoneName}{" "}
                                  <span className="text-muted-foreground">
                                    ({m.percentage}% / {fmtMoney(m.amount)})
                                  </span>
                                </span>
                                {m.isTriggered ? (
                                  <Pill tone="muted">
                                    Recognized{m.triggeredAt ? ` / ${m.triggeredAt.slice(0, 10)}` : ""}
                                  </Pill>
                                ) : (
                                  <button
                                    type="button"
                                    className={erp.primaryBtn}
                                    disabled={triggering === m.id}
                                    onClick={() => void triggerMilestone(m.id, m.milestoneName)}
                                  >
                                    <PlayCircle className="mr-1 inline h-3.5 w-3.5" />
                                    {triggering === m.id ? "Posting..." : "Trigger"}
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="WIP ledger activity (account 1210)" padded={false}>
            <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
              {wip?.activeBatchCount ?? 0} active production batch(es). Operational WIP value{" "}
              {fmtMoney(wip?.operationalWipValue ?? 0)}. Labor and material usage in Manufacturing posts Dr 1210 /
              Cr 5000 automatically.
            </div>
            {!wip?.recentCapitalizations.length ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No WIP journal activity yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {wip.recentCapitalizations.map((e) => (
                  <li key={e.id} className="px-4 py-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-xs">{e.reference ?? e.id.slice(0, 8)}</span>
                      <Pill tone="brand">{e.source}</Pill>
                    </div>
                    <p className="mt-1 text-muted-foreground">{e.memo}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.entryDate.slice(0, 10)} / {e.lines.length} lines
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
