import type { CrmOpportunity, CrmTask } from "@prisma/client";

import { getPrisma } from "../database";
import { newId, parseDate, parseDateOnly, resolveOrgId, toDateOnlyString } from "./shared";

export type PipelineStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export type OpportunityDto = {
  id: string;
  entityId: string;
  title: string;
  stage: PipelineStage;
  probability: number;
  expectedCloseDate: string;
  expectedRevenue: number;
  owner: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmTaskDto = {
  id: string;
  entityId: string;
  opportunityId?: string;
  title: string;
  dueAt: string;
  completed: boolean;
  type: "task" | "call" | "meeting" | "follow_up";
};

export type PipelineStateDto = {
  opportunities: OpportunityDto[];
  tasks: CrmTaskDto[];
};

function toOpportunityDto(row: CrmOpportunity): OpportunityDto {
  return {
    id: row.id,
    entityId: row.partyId,
    title: row.title,
    stage: row.stage as PipelineStage,
    probability: row.probability,
    expectedCloseDate: toDateOnlyString(row.expectedCloseDate),
    expectedRevenue: row.expectedRevenue,
    owner: row.owner,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTaskDto(row: CrmTask): CrmTaskDto {
  return {
    id: row.id,
    entityId: row.partyId,
    opportunityId: row.opportunityId ?? undefined,
    title: row.title,
    dueAt: row.dueAt.toISOString(),
    completed: row.completed,
    type: row.type as CrmTaskDto["type"],
  };
}

export async function getPipelineState(orgId = resolveOrgId()): Promise<PipelineStateDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const [opportunities, tasks] = await Promise.all([
    db.crmOpportunity.findMany({ where: { orgId: org }, orderBy: { updatedAt: "desc" } }),
    db.crmTask.findMany({ where: { orgId: org }, orderBy: { dueAt: "asc" } }),
  ]);
  return {
    opportunities: opportunities.map(toOpportunityDto),
    tasks: tasks.map(toTaskDto),
  };
}

export async function createOpportunity(orgId: string, opportunity: OpportunityDto): Promise<OpportunityDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const party = await db.crmParty.findFirst({
    where: { id: opportunity.entityId, orgId: org },
  });
  if (!party) throw new Error("Linked customer account not found.");

  const id = opportunity.id || newId("opp");
  const createdAt = opportunity.createdAt ? new Date(opportunity.createdAt) : new Date();
  const updatedAt = opportunity.updatedAt ? new Date(opportunity.updatedAt) : createdAt;

  const row = await db.crmOpportunity.create({
    data: {
      id,
      orgId: org,
      partyId: opportunity.entityId,
      title: opportunity.title.trim(),
      stage: opportunity.stage,
      probability: opportunity.probability,
      expectedCloseDate: parseDateOnly(opportunity.expectedCloseDate),
      expectedRevenue: opportunity.expectedRevenue,
      owner: opportunity.owner.trim(),
      createdAt,
      updatedAt,
    },
  });
  return toOpportunityDto(row);
}

export async function moveOpportunityStage(
  orgId: string,
  id: string,
  stage: PipelineStage,
): Promise<OpportunityDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.crmOpportunity.update({
    where: { id },
    data: { stage, updatedAt: new Date() },
  });
  if (row.orgId !== org) throw new Error("Opportunity not found.");
  return toOpportunityDto(row);
}

export async function createCrmTask(
  orgId: string,
  input: Omit<CrmTaskDto, "id" | "completed">,
): Promise<CrmTaskDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.crmTask.create({
    data: {
      id: newId("task"),
      orgId: org,
      partyId: input.entityId,
      opportunityId: input.opportunityId ?? null,
      title: input.title,
      dueAt: parseDate(input.dueAt),
      completed: false,
      type: input.type,
    },
  });
  return toTaskDto(row);
}

export async function completeCrmTask(orgId: string, id: string): Promise<CrmTaskDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.crmTask.update({ where: { id }, data: { completed: true } });
  if (row.orgId !== org) throw new Error("Task not found.");
  return toTaskDto(row);
}
