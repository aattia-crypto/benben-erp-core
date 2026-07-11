import { getPrisma } from "../database";
import { logActivity } from "../audit.service";
import { logger } from "../../utils/logger";
import { getAccountBalance } from "./gl.service";
import { postJournalWithIntegrity } from "./journal-post.service";
import { ORG_DEFAULT } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export type RevRecMilestoneInput = {
  milestoneName: string;
  percentage: number;
};

export type CreateRevRecScheduleInput = {
  invoiceId?: string;
  totalAmount: number;
  milestones: RevRecMilestoneInput[];
};

export async function createRevRecSchedule(input: CreateRevRecScheduleInput, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const total = ROUND(input.totalAmount);
  if (total <= 0) throw new Error("Schedule total must be positive.");
  if (!input.milestones.length) throw new Error("At least one milestone is required.");

  const pctSum = ROUND(input.milestones.reduce((s, m) => s + m.percentage, 0));
  if (Math.abs(pctSum - 100) > 0.01) {
    throw new Error(`Milestone percentages must sum to 100 (got ${pctSum}).`);
  }

  const schedule = await db.revRecSchedule.create({
    data: {
      orgId,
      invoiceId: input.invoiceId,
      totalAmount: total,
      recognizedAmount: 0,
      deferredAmount: total,
      status: "ACTIVE",
      milestones: {
        create: input.milestones.map((m) => ({
          orgId,
          milestoneName: m.milestoneName,
          percentage: ROUND(m.percentage),
          amount: ROUND((total * m.percentage) / 100),
        })),
      },
    },
    include: { milestones: { orderBy: { milestoneName: "asc" } } },
  });

  await logActivity({
    module: "rev-rec",
    action: "SCHEDULE_CREATED",
    entityType: "RevRecSchedule",
    entityId: schedule.id,
    summary: `Rev-rec schedule · $${total.toFixed(2)} · ${schedule.milestones.length} milestones`,
  });

  logger.info("Rev-rec schedule created", { id: schedule.id, total });
  return schedule;
}

export async function triggerRevRecMilestone(
  input: { milestoneId: string; idempotencyKey?: string },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const milestone = await db.revRecMilestone.findFirst({
    where: { id: input.milestoneId, orgId },
    include: { schedule: true },
  });
  if (!milestone) throw new Error("Milestone not found.");
  if (milestone.isTriggered) {
    return { milestone, journalEntryId: null, duplicate: true };
  }

  const amount = ROUND(milestone.amount);
  if (amount <= 0) throw new Error("Milestone amount must be positive.");

  const posted = await postJournalWithIntegrity(
    {
      memo: `Rev-rec · ${milestone.milestoneName}`,
      lines: [
        { accountCode: "2200", debit: amount, credit: 0, description: "Deferred revenue relief" },
        { accountCode: "4000", debit: 0, credit: amount, description: "Recognized revenue" },
      ],
      source: "REV_REC",
      module: "rev-rec",
      reference: milestone.id,
      idempotencyKey: input.idempotencyKey ?? `rev-rec-milestone-${milestone.id}`,
    },
    orgId,
  );

  const now = new Date();
  const schedule = milestone.schedule;
  const recognizedAmount = ROUND(schedule.recognizedAmount + amount);
  const deferredAmount = ROUND(Math.max(0, schedule.deferredAmount - amount));
  const allTriggered = await db.revRecMilestone.count({
    where: { scheduleId: schedule.id, isTriggered: false, id: { not: milestone.id } },
  });

  const updatedMilestone = await db.revRecMilestone.update({
    where: { id: milestone.id },
    data: { isTriggered: true, triggeredAt: now },
  });

  await db.revRecSchedule.update({
    where: { id: schedule.id },
    data: {
      recognizedAmount,
      deferredAmount,
      status: allTriggered === 0 ? "COMPLETE" : "ACTIVE",
    },
  });

  await logActivity({
    module: "rev-rec",
    action: "MILESTONE_TRIGGERED",
    entityType: "RevRecMilestone",
    entityId: milestone.id,
    summary: `${milestone.milestoneName} · $${amount.toFixed(2)} recognized`,
    afterJson: JSON.stringify({ journalEntryId: posted.id, duplicate: posted.duplicate }),
  });

  logger.info("Rev-rec milestone triggered", {
    milestoneId: milestone.id,
    amount,
    journalEntryId: posted.id,
  });

  return { milestone: updatedMilestone, journalEntryId: posted.id, duplicate: posted.duplicate };
}

export async function getRevRecDashboard(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const schedules = await db.revRecSchedule.findMany({
    where: { orgId },
    include: { milestones: { orderBy: { milestoneName: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  const deferredLedgerBalance = ROUND(-(await getAccountBalance("2200", orgId)));
  const scheduleDeferred = ROUND(schedules.reduce((s, sch) => s + sch.deferredAmount, 0));
  const scheduleRecognized = ROUND(schedules.reduce((s, sch) => s + sch.recognizedAmount, 0));

  return {
    schedules,
    summary: {
      scheduleCount: schedules.length,
      scheduleDeferred,
      scheduleRecognized,
      deferredLedgerBalance,
      activeSchedules: schedules.filter((s) => s.status === "ACTIVE").length,
    },
  };
}
