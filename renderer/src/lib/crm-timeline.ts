import { financeHealthCheck } from "./finance-api-client";
import { isDesktopShell } from "./desktop-api";
import { getArInvoices, getCollectionNotes } from "./ar-store";
import { getActivities, getReminders } from "./crm-store";
import { getCrmTasks, getOpportunities } from "./crm-pipeline-store";

export type TimelineItem = {
  id: string;
  at: string;
  kind: string;
  title: string;
  body: string;
};

const KIND_LABELS: Record<string, string> = {
  note: "Activity logged",
  call: "Activity logged",
  email: "Activity logged",
  meeting: "Activity logged",
  reminder: "Reminder",
  follow_up: "Task",
  opportunity: "Opportunity updated",
  invoice: "Invoice created",
  payment: "Payment received",
  credit: "Credit memo",
  collection: "Collection note",
};

function normalizeKind(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function pushActivityItems(entityId: string, items: TimelineItem[]): void {
  for (const a of getActivities(entityId)) {
    items.push({
      id: `act-${a.id}`,
      at: a.at,
      kind: "activity",
      title: normalizeKind(a.type),
      body: `${a.subject}: ${a.body}`,
    });
  }
  for (const r of getReminders(entityId)) {
    items.push({
      id: `rem-${r.id}`,
      at: r.dueAt,
      kind: "reminder",
      title: "Reminder",
      body: r.completed ? "Completed" : `Pending · ${r.title}`,
    });
  }
  for (const t of getCrmTasks(entityId)) {
    items.push({
      id: `task-${t.id}`,
      at: t.dueAt,
      kind: "task",
      title: t.completed ? "Task completed" : "Task open",
      body: t.title,
    });
  }
  for (const o of getOpportunities(entityId)) {
    items.push({
      id: `opp-${o.id}`,
      at: o.updatedAt,
      kind: "opportunity",
      title: "Opportunity updated",
      body: `${o.title} · ${o.stage} · $${o.expectedRevenue.toLocaleString()}`,
    });
  }
}

async function fetchLedgerTimeline(entityCode: string): Promise<TimelineItem[]> {
  if (!isDesktopShell() || !(await financeHealthCheck())) return [];
  try {
    const { financeApiFetch } = await import("./finance-api-client");
    const ledger = await financeApiFetch<{
      invoices: { id: string; invoiceNumber: string; issuedAt: string; balance: number; status: string; total: number }[];
      payments: { id: string; paidAt: string; amount: number; allocations: { amount: number; invoiceId: string }[] }[];
      credits: { id: string; creditedAt: string; amount: number; reason: string }[];
    }>(`/api/finance/ar/ledger/${encodeURIComponent(entityCode)}`);

    const items: TimelineItem[] = [];
    for (const inv of ledger.invoices) {
      items.push({
        id: `inv-${inv.id}`,
        at: String(inv.issuedAt).slice(0, 10),
        kind: "invoice",
        title: "Invoice created",
        body: `${inv.invoiceNumber} · ${fmt(inv.total)} · balance ${fmt(inv.balance)} · ${inv.status}`,
      });
    }
    for (const pay of ledger.payments) {
      const allocSum = pay.allocations?.reduce((s, a) => s + a.amount, 0) ?? pay.amount;
      items.push({
        id: `pay-${pay.id}`,
        at: String(pay.paidAt).slice(0, 10),
        kind: "payment",
        title: "Payment received",
        body: `${fmt(pay.amount)} applied (${fmt(allocSum)} allocated)`,
      });
    }
    for (const c of ledger.credits) {
      items.push({
        id: `cm-${c.id}`,
        at: String(c.creditedAt).slice(0, 10),
        kind: "credit",
        title: "Credit memo",
        body: `${c.reason} · -${fmt(c.amount)}`,
      });
    }
    return items;
  } catch {
    return [];
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function pushLocalArItems(entityCode: string, items: TimelineItem[]): void {
  for (const inv of getArInvoices().filter((i) => i.customerCode === entityCode)) {
    items.push({
      id: `inv-${inv.id}`,
      at: inv.issuedAt,
      kind: "invoice",
      title: "Invoice created",
      body: `${inv.invoiceNumber} · balance ${fmt(inv.balance)} · ${inv.status}`,
    });
  }
  for (const n of getCollectionNotes(entityCode)) {
    items.push({
      id: `col-${n.id}`,
      at: n.at,
      kind: "collection",
      title: "Collection note",
      body: n.note,
    });
  }
}

/** Sync timeline (legacy store AR when API unavailable). */
export function buildCustomerTimeline(entityId: string, entityCode?: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  pushActivityItems(entityId, items);
  if (entityCode) pushLocalArItems(entityCode, items);
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Unified chronological timeline — prefers local PostgreSQL ledger when Finance API is up. */
export async function buildCustomerTimelineBridge(
  entityId: string,
  entityCode?: string,
): Promise<TimelineItem[]> {
  const items: TimelineItem[] = [];
  pushActivityItems(entityId, items);

  if (entityCode) {
    const fromDb = await fetchLedgerTimeline(entityCode);
    if (fromDb.length > 0) items.push(...fromDb);
    else pushLocalArItems(entityCode, items);
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}
