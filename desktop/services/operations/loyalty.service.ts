import type { LoyaltyAccount, LoyaltyTransaction } from "@prisma/client";

import { getPrisma } from "../database";
import { newId, resolveOrgId } from "./shared";

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export type LoyaltyAccountDto = {
  id: string;
  customerCode: string;
  name: string;
  points: number;
  tier: LoyaltyTier;
  history: { id: string; type: "earn" | "redeem"; points: number; ref: string; at: string }[];
};

function tierForPoints(points: number): LoyaltyTier {
  if (points >= 5000) return "platinum";
  if (points >= 2500) return "gold";
  if (points >= 1000) return "silver";
  return "bronze";
}

function toAccountDto(row: LoyaltyAccount & { history: LoyaltyTransaction[] }): LoyaltyAccountDto {
  return {
    id: row.id,
    customerCode: row.customerCode,
    name: row.name,
    points: row.points,
    tier: row.tier as LoyaltyTier,
    history: row.history
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((h) => ({
        id: h.id,
        type: h.type as "earn" | "redeem",
        points: h.points,
        ref: h.ref,
        at: h.occurredAt.toISOString(),
      })),
  };
}

export async function listLoyaltyAccounts(orgId = resolveOrgId()): Promise<LoyaltyAccountDto[]> {
  const db = getPrisma();
  const rows = await db.loyaltyAccount.findMany({
    where: { orgId: resolveOrgId(orgId) },
    include: { history: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toAccountDto);
}

export async function earnPoints(
  orgId: string,
  customerCode: string,
  points: number,
  ref: string,
): Promise<LoyaltyAccountDto[]> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);

  await db.$transaction(async (tx) => {
    const account = await tx.loyaltyAccount.findUnique({
      where: { orgId_customerCode: { orgId: org, customerCode } },
    });
    if (!account) return;

    const newPoints = account.points + points;
    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: { points: newPoints, tier: tierForPoints(newPoints) },
    });
    await tx.loyaltyTransaction.create({
      data: {
        id: newId("lh"),
        orgId: org,
        accountId: account.id,
        type: "earn",
        points,
        ref,
        occurredAt: new Date(),
      },
    });
  });

  return listLoyaltyAccounts(org);
}

export async function redeemPoints(
  orgId: string,
  customerCode: string,
  points: number,
  ref: string,
): Promise<{ ok: boolean; accounts: LoyaltyAccountDto[] }> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const account = await db.loyaltyAccount.findUnique({
    where: { orgId_customerCode: { orgId: org, customerCode } },
  });
  if (!account || account.points < points) {
    return { ok: false, accounts: await listLoyaltyAccounts(org) };
  }

  await db.$transaction(async (tx) => {
    const newPoints = account.points - points;
    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: { points: newPoints, tier: tierForPoints(newPoints) },
    });
    await tx.loyaltyTransaction.create({
      data: {
        id: newId("lh"),
        orgId: org,
        accountId: account.id,
        type: "redeem",
        points,
        ref,
        occurredAt: new Date(),
      },
    });
  });

  return { ok: true, accounts: await listLoyaltyAccounts(org) };
}
