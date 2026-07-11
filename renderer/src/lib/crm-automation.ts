/**
 * Automation-ready event hooks — lightweight foundation for future workflows.
 */
import { createCrmTask } from "./crm-pipeline-store";
import { addActivity } from "./crm-store";
import { publishErpChange } from "./erp-sync";

export type AutomationEvent =
  | { type: "invoice_overdue"; entityId: string; invoiceRef: string; daysOverdue: number }
  | { type: "opportunity_closed_won"; entityId: string; opportunityId: string; amount: number }
  | { type: "customer_inactive"; entityId: string; daysSinceActivity: number }
  | { type: "lead_created"; entityId: string; owner?: string }
  | { type: "stale_lead"; entityId: string; daysIdle: number }
  | { type: "pipeline_stage_changed"; entityId: string; opportunityId: string; stage: string };

const handlers: ((event: AutomationEvent) => void)[] = [];

export function registerAutomationHandler(fn: (event: AutomationEvent) => void): () => void {
  handlers.push(fn);
  return () => {
    const i = handlers.indexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function dispatchAutomation(event: AutomationEvent): void {
  handlers.forEach((h) => {
    try {
      h(event);
    } catch (e) {
      console.warn("automation handler error", e);
    }
  });
  publishErpChange("crm", "automation", event.type);
}

/** Default built-in rules (extensible without over-engineering). */
registerAutomationHandler((event) => {
  if (event.type === "customer_inactive") {
    createCrmTask({
      entityId: event.entityId,
      title: "Re-engage inactive customer",
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      type: "follow_up",
    });
    addActivity(event.entityId, "note", "Stale account", `No activity ${event.daysSinceActivity} days`);
  }
  if (event.type === "invoice_overdue") {
    createCrmTask({
      entityId: event.entityId,
      title: `Follow up on overdue invoice ${event.invoiceRef}`,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      type: "follow_up",
    });
    addActivity(event.entityId, "note", "Automation", `Overdue ${event.daysOverdue}d — follow-up task created`);
  }
  if (event.type === "opportunity_closed_won") {
    addActivity(
      event.entityId,
      "note",
      "Won opportunity",
      `Closed won · notify accounting for ${event.amount}`,
    );
  }
  if (event.type === "stale_lead") {
    createCrmTask({
      entityId: event.entityId,
      title: "Re-engage stale lead",
      dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      type: "follow_up",
    });
    addActivity(event.entityId, "note", "Automation", `Lead idle ${event.daysIdle} days`);
  }
  if (event.type === "lead_created" && event.owner) {
    addActivity(event.entityId, "note", "Lead assignment", `Assigned to ${event.owner}`);
  }
});
