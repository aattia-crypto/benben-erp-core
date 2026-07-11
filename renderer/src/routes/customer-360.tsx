import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, Panel, Pill, StatCard, KpiGrid, fmtMoney, erp } from "@/components/ui-bits";
import { getEntities, getActivities, subscribeCrm } from "@/lib/crm-store";
import { getOpportunities } from "@/lib/crm-pipeline-store";
import { financeApiFetch, financeHealthCheck } from "@/lib/finance-api-client";
import { isDesktopShell } from "@/lib/desktop-api";
import { buildCustomerTimelineBridge, type TimelineItem } from "@/lib/crm-timeline";
import type { Entity } from "@/lib/mock-data";

export const Route = createFileRoute("/customer-360")({
  head: () => ({ meta: [{ title: "Customer 360 — Benben ERP" }] }),
  component: Customer360Page,
});

type FinanceParty = { code: string; name: string };

type CustomerOption = {
  id: string;
  code: string;
  name: string;
  contact?: string;
  status?: Entity["status"];
  source: "crm" | "finance";
  crmEntityId?: string;
};

function crmCustomers(): Entity[] {
  return getEntities().filter((e) => e.kind === "client" || e.kind === "both");
}

function mergeCustomerOptions(crm: Entity[], financeParties: FinanceParty[]): CustomerOption[] {
  const byCode = new Map<string, CustomerOption>();

  for (const e of crm) {
    byCode.set(e.code.toUpperCase(), {
      id: e.id,
      code: e.code,
      name: e.name,
      contact: e.contact,
      status: e.status,
      source: "crm",
      crmEntityId: e.id,
    });
  }

  for (const party of financeParties) {
    const key = party.code.toUpperCase();
    if (!byCode.has(key)) {
      byCode.set(key, {
        id: `finance:${party.code}`,
        code: party.code,
        name: party.name,
        source: "finance",
      });
    }
  }

  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function Customer360Page() {
  const [, crmTick] = useState(0);
  const [financeParties, setFinanceParties] = useState<FinanceParty[]>([]);
  const [entityId, setEntityId] = useState("");
  const [ledger, setLedger] = useState<{
    balance: number;
    invoices: { invoiceNumber: string; balance: number; status: string }[];
    payments: { amount: number; at: string }[];
  } | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);

  useEffect(() => subscribeCrm(() => crmTick((n) => n + 1)), []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    void (async () => {
      if (!(await financeHealthCheck())) {
        setFinanceParties([]);
        return;
      }
      try {
        const res = await financeApiFetch<{
          invoices: { customerCode: string; customerName: string }[];
        }>("/api/finance/ar/invoices");
        const parties = new Map<string, string>();
        for (const inv of res.invoices ?? []) {
          const code = String(inv.customerCode).trim();
          if (!code) continue;
          if (!parties.has(code)) parties.set(code, String(inv.customerName).trim() || code);
        }
        setFinanceParties([...parties.entries()].map(([code, name]) => ({ code, name })));
      } catch {
        setFinanceParties([]);
      }
    })();
  }, []);

  const entities = useMemo(
    () => mergeCustomerOptions(crmCustomers(), financeParties),
    [crmTick, financeParties],
  );

  useEffect(() => {
    if (!entityId && entities.length > 0) setEntityId(entities[0].id);
    if (entityId && entities.length > 0 && !entities.some((e) => e.id === entityId)) {
      setEntityId(entities[0].id);
    }
  }, [entities, entityId]);

  const entity = entities.find((e) => e.id === entityId);
  const code = entity?.code ?? "";
  const crmEntityId = entity?.crmEntityId ?? "";

  useEffect(() => {
    if (!isDesktopShell() || !code) {
      setLedger(null);
      return;
    }
    void financeApiFetch<typeof ledger>(`/api/finance/ar/ledger/${encodeURIComponent(code)}`).then(
      (d) => setLedger(d as typeof ledger),
    );
  }, [code]);

  const opportunities = useMemo(
    () => (crmEntityId ? getOpportunities(crmEntityId) : []),
    [crmEntityId],
  );
  const activities = crmEntityId ? getActivities(crmEntityId) : [];

  useEffect(() => {
    if (!entity) {
      setTimeline([]);
      return;
    }
    void buildCustomerTimelineBridge(crmEntityId, entity.code).then(setTimeline);
  }, [entity, crmEntityId]);

  return (
    <div className="space-y-6">
      <PageHeader title="Customer 360" subtitle="Contact, pipeline, AR, activities, and financial timeline." />
      <Panel title="Select customer">
        <select className={erp.input} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
          {entities.length === 0 ? (
            <option value="">No customers found</option>
          ) : (
            entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.code})
                {e.source === "finance" ? " · AR" : ""}
              </option>
            ))
          )}
        </select>
      </Panel>

      {entity && (
        <>
          <KpiGrid columns={3}>
            <StatCard accent="financial" label="Balance" value={fmtMoney(ledger?.balance ?? 0)} />
            <StatCard accent="revenue" label="Open opportunities" value={String(opportunities.length)} />
            <StatCard accent="operational" label="Activities" value={String(activities.length)} />
          </KpiGrid>

          <Panel title="Contact">
            <p className="text-sm">
              {entity.name} · {entity.contact ?? "—"}
            </p>
            <Pill tone="brand">{entity.status ?? (entity.source === "finance" ? "active" : "—")}</Pill>
          </Panel>

          <Panel title="Opportunities">
            <ul className="text-sm">
              {opportunities.map((o) => (
                <li key={o.id} className="border-b border-border py-2">
                  {o.title} — {fmtMoney(o.expectedRevenue)} · {o.stage}
                </li>
              ))}
              {opportunities.length === 0 && <li className="text-muted-foreground">No open opportunities</li>}
            </ul>
          </Panel>

          <Panel title="AR summary">
            <ul className="text-sm">
              {(ledger?.invoices ?? []).map((inv) => (
                <li key={inv.invoiceNumber} className="flex justify-between border-b border-border py-1">
                  <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                  <span className={erp.financial}>{fmtMoney(inv.balance)}</span>
                </li>
              ))}
              {(ledger?.invoices ?? []).length === 0 && (
                <li className="text-muted-foreground">No open invoices in ledger</li>
              )}
            </ul>
          </Panel>

          <Panel title="Financial timeline">
            <ul className="text-xs text-muted-foreground">
              {timeline.map((t) => (
                <li key={t.id}>
                  {t.at}: {t.title} — {t.body}
                </li>
              ))}
              {timeline.length === 0 && <li>No timeline events yet</li>}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
