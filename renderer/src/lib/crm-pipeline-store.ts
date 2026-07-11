import { publishErpChange } from "./erp-sync";
import * as pipelineBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type PipelineStage = pipelineBridge.PipelineStage;
export type Opportunity = pipelineBridge.Opportunity;
export type CrmTask = pipelineBridge.CrmTask;

type Store = pipelineBridge.PipelineState;

const listeners = new Set<() => void>();
let cache: Store = { opportunities: [], tasks: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

function applyCache(next: Store) {
  cache = next;
  emit();
}

export function subscribePipeline(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidatePipelineHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

export async function hydratePipelineStore(): Promise<void> {
  if (!isOperationsBackend()) {
    return;
  }
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = pipelineBridge.fetchPipelineState().then((state) => {
      cache = state;
      hydrated = true;
      emit();
    }).catch((err) => {
      hydratePromise = null;
      throw err;
    });
  }
  await hydratePromise;
}

function ensureHydrationKickoff(): void {
  if (!isOperationsBackend() || hydrated || hydratePromise) return;
  void hydratePipelineStore();
}

export function getOpportunities(entityId?: string): Opportunity[] {
  ensureHydrationKickoff();
  const list = entityId ? cache.opportunities.filter((o) => o.entityId === entityId) : cache.opportunities;
  return [...list].sort((a, b) => a.stage.localeCompare(b.stage));
}

export function createOpportunity(input: Omit<Opportunity, "id" | "createdAt" | "updatedAt">): Opportunity {
  const now = new Date().toISOString();
  const opp: Opportunity = { ...input, id: uid("opp"), createdAt: now, updatedAt: now };
  const previous = cache;
  applyCache({ ...cache, opportunities: [opp, ...cache.opportunities] });
  publishErpChange("crm", "opportunity-created", opp.id);

  if (!isOperationsBackend()) return opp;

  persistInBackground(
    "crm-pipeline-store",
    async () => {
      const saved = await pipelineBridge.createOpportunityRemote(opp);
      applyCache({
        ...cache,
        opportunities: [saved, ...cache.opportunities.filter((o) => o.id !== opp.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return opp;
}

export async function moveOpportunityStage(id: string, stage: PipelineStage): Promise<void> {
  const previous = cache;
  applyCache({
    ...cache,
    opportunities: cache.opportunities.map((o) =>
      o.id === id ? { ...o, stage, updatedAt: new Date().toISOString() } : o,
    ),
  });
  publishErpChange("crm", "opportunity-stage", id);

  if (!isOperationsBackend()) return;

  try {
    const saved = await pipelineBridge.moveOpportunityStageRemote(id, stage);
    applyCache({
      ...cache,
      opportunities: cache.opportunities.map((o) => (o.id === id ? saved : o)),
    });
  } catch (err) {
    cache = previous;
    emit();
    throw err;
  }
}

export function getCrmTasks(entityId?: string): CrmTask[] {
  ensureHydrationKickoff();
  const list = entityId ? cache.tasks.filter((t) => t.entityId === entityId) : cache.tasks;
  return list.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function createCrmTask(input: Omit<CrmTask, "id" | "completed">): CrmTask {
  const task: CrmTask = { ...input, id: uid("task"), completed: false };
  const previous = cache;
  applyCache({ ...cache, tasks: [task, ...cache.tasks] });

  if (!isOperationsBackend()) return task;

  persistInBackground(
    "crm-pipeline-store",
    async () => {
      const saved = await pipelineBridge.createCrmTaskRemote(input);
      applyCache({
        ...cache,
        tasks: [saved, ...cache.tasks.filter((t) => t.id !== task.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return task;
}

export function completeCrmTask(id: string): void {
  const previous = cache;
  applyCache({
    ...cache,
    tasks: cache.tasks.map((t) => (t.id === id ? { ...t, completed: true } : t)),
  });

  if (!isOperationsBackend()) return;

  persistInBackground(
    "crm-pipeline-store",
    async () => {
      const saved = await pipelineBridge.completeCrmTaskRemote(id);
      applyCache({
        ...cache,
        tasks: cache.tasks.map((t) => (t.id === id ? saved : t)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function getPipelineForecast(): { weighted: number; total: number; byStage: Record<string, number> } {
  const open = cache.opportunities.filter(
    (o) => o.stage !== "closed_won" && o.stage !== "closed_lost",
  );
  const weighted = open.reduce((s, o) => s + o.expectedRevenue * (o.probability / 100), 0);
  const total = open.reduce((s, o) => s + o.expectedRevenue, 0);
  const byStage: Record<string, number> = {};
  for (const o of open) {
    byStage[o.stage] = (byStage[o.stage] ?? 0) + o.expectedRevenue;
  }
  return { weighted, total, byStage };
}

export function resetPipelineStore(): void {
  cache = { opportunities: [], tasks: [] };
  hydrated = false;
  hydratePromise = null;
  emit();
}
