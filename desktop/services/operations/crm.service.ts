import type { CrmActivity, CrmParty, CrmReminder } from "@prisma/client";

import { getPrisma } from "../database";
import { newId, parseDate, resolveOrgId } from "./shared";

export type EntityKind = "client" | "vendor" | "both";

export type EntityDto = {
  id: string;
  code: string;
  name: string;
  kind: EntityKind;
  country: string;
  contact: string;
  address?: string;
  phone?: string;
  taxId?: string;
  paymentTerms?: string;
  ytdValue: number;
  status: "active" | "inactive";
};

export type CrmActivityDto = {
  id: string;
  entityId: string;
  type: "call" | "email" | "meeting" | "note";
  subject: string;
  body: string;
  at: string;
};

export type CrmReminderDto = {
  id: string;
  entityId: string;
  title: string;
  dueAt: string;
  completed: boolean;
};

export type CrmStateDto = {
  entities: EntityDto[];
  activities: CrmActivityDto[];
  reminders: CrmReminderDto[];
};

export type EntityInputDto = {
  name: string;
  kind: EntityKind;
  country: string;
  contact: string;
  address?: string;
  phone?: string;
  taxId?: string;
  paymentTerms?: string;
  ytdValue?: number;
};

function toEntityDto(row: CrmParty): EntityDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind as EntityKind,
    country: row.country,
    contact: row.contact,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    taxId: row.taxId ?? undefined,
    paymentTerms: row.paymentTerms ?? undefined,
    ytdValue: row.ytdValue,
    status: row.status === "inactive" ? "inactive" : "active",
  };
}

export async function getCrmState(orgId = resolveOrgId()): Promise<CrmStateDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const [entities, activities, reminders] = await Promise.all([
    db.crmParty.findMany({ where: { orgId: org }, orderBy: { name: "asc" } }),
    db.crmActivity.findMany({ where: { orgId: org }, orderBy: { occurredAt: "desc" } }),
    db.crmReminder.findMany({ where: { orgId: org }, orderBy: { dueAt: "asc" } }),
  ]);

  return {
    entities: entities.map(toEntityDto),
    activities: activities.map((a) => ({
      id: a.id,
      entityId: a.partyId,
      type: a.type as CrmActivityDto["type"],
      subject: a.subject,
      body: a.body,
      at: a.occurredAt.toISOString(),
    })),
    reminders: reminders.map((r) => ({
      id: r.id,
      entityId: r.partyId,
      title: r.title,
      dueAt: r.dueAt.toISOString(),
      completed: r.completed,
    })),
  };
}

export async function importEntityRecord(
  orgId: string,
  input: { code: string; name: string; kind: EntityKind; contact?: string; country?: string },
): Promise<EntityDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const code = input.code.trim().toUpperCase();
  const conflict = await db.crmParty.findUnique({ where: { orgId_code: { orgId: org, code } } });
  if (conflict) throw new Error(`Duplicate code ${code}`);

  const row = await db.crmParty.create({
    data: {
      id: newId("e"),
      orgId: org,
      code,
      name: input.name.trim(),
      kind: input.kind,
      country: (input.country ?? "USA").trim().toUpperCase().slice(0, 3),
      contact: (input.contact ?? "").trim(),
      ytdValue: 0,
      status: "active",
    },
  });
  return toEntityDto(row);
}

export async function createEntity(orgId: string, entity: EntityDto): Promise<EntityDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const count = await db.crmParty.count({ where: { orgId: org } });
  const prefix = entity.kind === "vendor" ? "V" : entity.kind === "client" ? "C" : "B";
  const code = entity.code?.trim() || `${prefix}-${String(count + 3000)}`;
  const id = entity.id || newId("e");

  const row = await db.crmParty.create({
    data: {
      id,
      orgId: org,
      code,
      name: entity.name.trim(),
      kind: entity.kind,
      country: entity.country.trim().toUpperCase().slice(0, 3),
      contact: entity.contact.trim(),
      address: entity.address?.trim() || null,
      phone: entity.phone?.trim() || null,
      taxId: entity.taxId?.trim() || null,
      paymentTerms: entity.paymentTerms?.trim() || "Net 30",
      ytdValue: entity.ytdValue ?? 0,
      status: entity.status === "inactive" ? "inactive" : "active",
    },
  });
  return toEntityDto(row);
}

export async function updateEntity(
  orgId: string,
  id: string,
  patch: Partial<EntityInputDto>,
): Promise<EntityDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.country !== undefined) data.country = patch.country.trim().toUpperCase().slice(0, 3);
  if (patch.contact !== undefined) data.contact = patch.contact.trim();
  if (patch.ytdValue !== undefined) data.ytdValue = patch.ytdValue;

  const row = await db.crmParty.update({ where: { id }, data });
  if (row.orgId !== org) throw new Error("Entity not found.");
  return toEntityDto(row);
}

export async function addActivity(
  orgId: string,
  entityId: string,
  type: CrmActivityDto["type"],
  subject: string,
  body: string,
): Promise<CrmActivityDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.crmActivity.create({
    data: {
      id: newId("act"),
      orgId: org,
      partyId: entityId,
      type,
      subject: subject.trim(),
      body: body.trim(),
      occurredAt: new Date(),
    },
  });
  return {
    id: row.id,
    entityId: row.partyId,
    type: row.type as CrmActivityDto["type"],
    subject: row.subject,
    body: row.body,
    at: row.occurredAt.toISOString(),
  };
}

export async function addReminder(
  orgId: string,
  entityId: string,
  title: string,
  dueAt: string,
): Promise<CrmReminderDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.crmReminder.create({
    data: {
      id: newId("rem"),
      orgId: org,
      partyId: entityId,
      title: title.trim(),
      dueAt: parseDate(dueAt),
      completed: false,
    },
  });
  return {
    id: row.id,
    entityId: row.partyId,
    title: row.title,
    dueAt: row.dueAt.toISOString(),
    completed: row.completed,
  };
}

export async function completeReminder(orgId: string, id: string): Promise<CrmReminderDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.crmReminder.update({ where: { id }, data: { completed: true } });
  if (row.orgId !== org) throw new Error("Reminder not found.");
  return {
    id: row.id,
    entityId: row.partyId,
    title: row.title,
    dueAt: row.dueAt.toISOString(),
    completed: row.completed,
  };
}
