import { type Entity, type EntityKind } from "./mock-data";
import {
  DEMO_CRM_ACTIVITIES,
  DEMO_CRM_PARTIES,
  DEMO_CRM_REMINDERS,
  shouldUseDemoFallback,
} from "./demo-data-provider";
import { isDemoBuild } from "./demo-build";
import * as crmBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type CrmActivity = crmBridge.CrmActivity;
export type CrmReminder = crmBridge.CrmReminder;
export type EntityInput = crmBridge.EntityInput;

type Store = crmBridge.CrmState;

const listeners = new Set<() => void>();
let cache: Store = { entities: [], activities: [], reminders: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emptyStore(): Store {
  return { entities: [], activities: [], reminders: [] };
}

function emit() {
  listeners.forEach((fn) => fn());
}

function applyCache(next: Store) {
  cache = next;
  emit();
}

export function resetCrmStore(): void {
  cache = emptyStore();
  hydrated = false;
  hydratePromise = null;
  emit();
}

export function subscribeCrm(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidateCrmHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

function seedCrmFromDemo(): void {
  cache = {
    entities: DEMO_CRM_PARTIES.map((e) => ({ ...e })),
    activities: DEMO_CRM_ACTIVITIES.map((a) => ({ ...a })),
    reminders: DEMO_CRM_REMINDERS.map((r) => ({ ...r })),
  };
}

/** Presenter Mode: fill cache immediately (no IPC). */
export function applyDemoFallbackSeed(): void {
  if (!isDemoBuild()) return;
  seedCrmFromDemo();
  hydrated = true;
  emit();
}

export async function hydrateCrmStore(): Promise<void> {
  if (isDemoBuild()) {
    applyDemoFallbackSeed();
  }
  if (!isOperationsBackend()) return;
  if (!isDemoBuild() && hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const state = await crmBridge.fetchCrmState();
        if (isDemoBuild()) {
          if (state.entities.length > 0) {
            cache = state;
            emit();
          }
          return;
        }
        cache = state;
        hydrated = true;
        emit();
      } catch (err) {
        if (isDemoBuild()) {
          applyDemoFallbackSeed();
          return;
        }
        hydratePromise = null;
        throw err;
      }
    })();
  }
  await hydratePromise;
}

function ensureHydrationKickoff(): void {
  if (!isOperationsBackend() || hydrated || hydratePromise) return;
  void hydrateCrmStore();
}

export function getEntities(): Entity[] {
  ensureHydrationKickoff();
  if (shouldUseDemoFallback() && cache.entities.length === 0) {
    applyDemoFallbackSeed();
  }
  return cache.entities.length > 0
    ? cache.entities
    : shouldUseDemoFallback()
      ? DEMO_CRM_PARTIES
      : cache.entities;
}

export function getActivities(entityId?: string): CrmActivity[] {
  ensureHydrationKickoff();
  const activities =
    shouldUseDemoFallback() && cache.activities.length === 0
      ? DEMO_CRM_ACTIVITIES
      : cache.activities;
  return entityId ? activities.filter((a) => a.entityId === entityId) : activities;
}

export function getReminders(entityId?: string): CrmReminder[] {
  ensureHydrationKickoff();
  const reminders =
    shouldUseDemoFallback() && cache.reminders.length === 0
      ? DEMO_CRM_REMINDERS
      : cache.reminders;
  const list = entityId ? reminders.filter((r) => r.entityId === entityId) : reminders;
  return list.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function importEntityRecord(input: {
  code: string;
  name: string;
  kind: EntityKind;
  contact?: string;
  country?: string;
}): Entity {
  const code = input.code.trim().toUpperCase();
  if (cache.entities.some((e) => e.code.toUpperCase() === code)) {
    throw new Error(`Duplicate code ${code}`);
  }
  const entity: Entity = {
    id: uid("e"),
    code,
    name: input.name.trim(),
    kind: input.kind,
    country: (input.country ?? "USA").trim().toUpperCase().slice(0, 3),
    contact: (input.contact ?? "").trim(),
    ytdValue: 0,
    status: "active",
  };
  const previous = cache;
  applyCache({ ...cache, entities: [entity, ...cache.entities] });

  if (!isOperationsBackend()) return entity;

  persistInBackground(
    "crm-store",
    async () => {
      const saved = await crmBridge.importEntityRemote(input);
      applyCache({
        ...cache,
        entities: [saved, ...cache.entities.filter((e) => e.id !== entity.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return entity;
}

export function createEntity(input: EntityInput): Entity {
  const prefix = input.kind === "vendor" ? "V" : input.kind === "client" ? "C" : "B";
  const seq = String(cache.entities.length + 3000);
  const entity: Entity = {
    id: uid("e"),
    code: `${prefix}-${seq}`,
    name: input.name.trim(),
    kind: input.kind,
    country: input.country.trim().toUpperCase().slice(0, 3),
    contact: input.contact.trim(),
    ytdValue: input.ytdValue ?? 0,
    status: "active",
  };
  const previous = cache;
  applyCache({ ...cache, entities: [entity, ...cache.entities] });

  if (!isOperationsBackend()) return entity;

  persistInBackground(
    "crm-store",
    async () => {
      const saved = await crmBridge.createEntityRemote(entity);
      applyCache({
        ...cache,
        entities: [saved, ...cache.entities.filter((e) => e.id !== entity.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return entity;
}

export function updateEntity(id: string, patch: Partial<EntityInput>): Entity | null {
  let updated: Entity | null = null;
  const entities = cache.entities.map((e) => {
    if (e.id !== id) return e;
    updated = { ...e, ...patch };
    return updated;
  });
  if (!updated) return null;
  const previous = cache;
  applyCache({ ...cache, entities });

  if (!isOperationsBackend()) return updated;

  persistInBackground(
    "crm-store",
    async () => {
      const saved = await crmBridge.updateEntityRemote(id, patch);
      applyCache({
        ...cache,
        entities: cache.entities.map((e) => (e.id === id ? saved : e)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return updated;
}

export function addActivity(
  entityId: string,
  type: CrmActivity["type"],
  subject: string,
  body: string,
): CrmActivity {
  const activity: CrmActivity = {
    id: uid("act"),
    entityId,
    type,
    subject: subject.trim(),
    body: body.trim(),
    at: new Date().toISOString(),
  };
  const previous = cache;
  applyCache({ ...cache, activities: [activity, ...cache.activities] });

  if (!isOperationsBackend()) return activity;

  persistInBackground(
    "crm-store",
    async () => {
      const saved = await crmBridge.addActivityRemote(entityId, type, subject, body);
      applyCache({
        ...cache,
        activities: [saved, ...cache.activities.filter((a) => a.id !== activity.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return activity;
}

export function addReminder(entityId: string, title: string, dueAt: string): CrmReminder {
  const reminder: CrmReminder = {
    id: uid("rem"),
    entityId,
    title: title.trim(),
    dueAt,
    completed: false,
  };
  const previous = cache;
  applyCache({ ...cache, reminders: [reminder, ...cache.reminders] });

  if (!isOperationsBackend()) return reminder;

  persistInBackground(
    "crm-store",
    async () => {
      const saved = await crmBridge.addReminderRemote(entityId, title, dueAt);
      applyCache({
        ...cache,
        reminders: [saved, ...cache.reminders.filter((r) => r.id !== reminder.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return reminder;
}

export function completeReminder(id: string): void {
  const previous = cache;
  applyCache({
    ...cache,
    reminders: cache.reminders.map((r) => (r.id === id ? { ...r, completed: true } : r)),
  });

  if (!isOperationsBackend()) return;

  persistInBackground(
    "crm-store",
    async () => {
      const saved = await crmBridge.completeReminderRemote(id);
      applyCache({
        ...cache,
        reminders: cache.reminders.map((r) => (r.id === id ? saved : r)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}
