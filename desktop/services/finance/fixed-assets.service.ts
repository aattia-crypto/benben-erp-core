import { getPrisma } from "../database";
import { postJournalEntry } from "./gl.service";
import { ORG_DEFAULT, type DepreciationMethod } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export interface CreateFixedAssetInput {
  assetTag: string;
  name: string;
  categoryCode: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue?: number;
  usefulLifeMonths?: number;
  depreciationMethod?: DepreciationMethod;
  currency?: string;
}

export async function ensureDefaultAssetCategory(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  return db.assetCategory.upsert({
    where: { orgId_code: { orgId, code: "GEN" } },
    create: {
      orgId,
      code: "GEN",
      name: "General Equipment",
      depreciationMethod: "STRAIGHT_LINE",
      defaultUsefulLifeMonths: 60,
      glAssetAccountCode: "1500",
      glAccumDepAccountCode: "1510",
      glExpenseAccountCode: "6100",
    },
    update: {},
  });
}

export async function createFixedAsset(input: CreateFixedAssetInput, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const category = await db.assetCategory.findFirst({
    where: { orgId, code: input.categoryCode },
  });
  if (!category) {
    throw new Error(`Asset category not found: ${input.categoryCode}`);
  }

  const usefulLife = input.usefulLifeMonths ?? category.defaultUsefulLifeMonths;
  const method = input.depreciationMethod ?? (category.depreciationMethod as DepreciationMethod);
  const salvage = input.salvageValue ?? 0;
  const cost = input.acquisitionCost;

  const asset = await db.fixedAsset.create({
    data: {
      orgId,
      assetTag: input.assetTag,
      name: input.name,
      categoryId: category.id,
      acquisitionDate: new Date(input.acquisitionDate),
      acquisitionCost: cost,
      salvageValue: salvage,
      usefulLifeMonths: usefulLife,
      depreciationMethod: method,
      currency: input.currency ?? "USD",
      bookValue: cost,
      status: "ACTIVE",
    },
    include: { category: true },
  });

  await postJournalEntry(
    {
      entryDate: new Date(input.acquisitionDate),
      reference: `FA-${input.assetTag}`,
      memo: `Capitalize fixed asset ${input.name}`,
      source: "MANUAL",
      lines: [
        {
          accountCode: category.glAssetAccountCode,
          debit: cost,
          description: input.name,
        },
        {
          accountCode: "1000",
          credit: cost,
          description: `Acquisition ${input.assetTag}`,
        },
      ],
    },
    orgId,
  );

  return asset;
}

export function calculateDepreciationForPeriod(
  method: DepreciationMethod,
  acquisitionCost: number,
  salvageValue: number,
  usefulLifeMonths: number,
  bookValue: number,
  monthsElapsed: number,
): number {
  const depreciable = acquisitionCost - salvageValue;
  if (depreciable <= 0 || bookValue <= salvageValue) return 0;

  if (method === "STRAIGHT_LINE") {
    const monthly = depreciable / usefulLifeMonths;
    const remaining = bookValue - salvageValue;
    return ROUND(Math.min(monthly, remaining));
  }

  // Double-declining balance (monthly rate)
  const annualRate = 2 / (usefulLifeMonths / 12);
  const monthlyRate = annualRate / 12;
  const amount = bookValue * monthlyRate;
  const remaining = bookValue - salvageValue;
  return ROUND(Math.min(amount, remaining));
}

export async function buildDepreciationSchedule(assetId: string, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const asset = await db.fixedAsset.findFirst({
    where: { id: assetId, orgId },
    include: { category: true, schedules: { orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }] } },
  });
  if (!asset) throw new Error(`Fixed asset not found: ${assetId}`);

  const start = new Date(asset.acquisitionDate);
  let bookValue = asset.acquisitionCost;
  const schedules: {
    periodYear: number;
    periodMonth: number;
    depreciationAmount: number;
    bookValueAfter: number;
    status: string;
  }[] = [];

  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;

  let year = start.getFullYear();
  let month = start.getMonth() + 1;
  let monthsElapsed = 0;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    if (year > start.getFullYear() || (year === start.getFullYear() && month >= start.getMonth() + 1)) {
      monthsElapsed += 1;
      const dep = calculateDepreciationForPeriod(
        asset.depreciationMethod as DepreciationMethod,
        asset.acquisitionCost,
        asset.salvageValue,
        asset.usefulLifeMonths,
        bookValue,
        monthsElapsed,
      );
      if (dep > 0) {
        bookValue = ROUND(bookValue - dep);
        schedules.push({
          periodYear: year,
          periodMonth: month,
          depreciationAmount: dep,
          bookValueAfter: bookValue,
          status: "SCHEDULED",
        });
      }
      if (bookValue <= asset.salvageValue + 0.01) break;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return { asset, projected: schedules, posted: asset.schedules };
}

export async function runMonthlyDepreciation(
  runYear: number,
  runMonth: number,
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const existing = await db.depreciationRun.findUnique({
    where: { orgId_runYear_runMonth: { orgId, runYear, runMonth } },
  });
  if (existing?.status === "COMPLETED") {
    return { run: existing, skipped: true, message: "Depreciation already posted for period." };
  }

  const assets = await db.fixedAsset.findMany({
    where: { orgId, status: "ACTIVE" },
    include: { category: true },
  });

  let totalDepreciation = 0;
  const lineDetails: { assetTag: string; amount: number; categoryCode: string }[] = [];

  for (const asset of assets) {
    const existingSchedule = await db.depreciationSchedule.findUnique({
      where: {
        fixedAssetId_periodYear_periodMonth: {
          fixedAssetId: asset.id,
          periodYear: runYear,
          periodMonth: runMonth,
        },
      },
    });
    if (existingSchedule?.status === "POSTED") continue;

    const monthsElapsed =
      (runYear - asset.acquisitionDate.getFullYear()) * 12 +
      (runMonth - (asset.acquisitionDate.getMonth() + 1)) +
      1;

    if (monthsElapsed < 1) continue;

    const dep = calculateDepreciationForPeriod(
      asset.depreciationMethod as DepreciationMethod,
      asset.acquisitionCost,
      asset.salvageValue,
      asset.usefulLifeMonths,
      asset.bookValue,
      monthsElapsed,
    );
    if (dep <= 0) continue;

    const bookAfter = ROUND(asset.bookValue - dep);
    const schedule = await db.depreciationSchedule.upsert({
      where: {
        fixedAssetId_periodYear_periodMonth: {
          fixedAssetId: asset.id,
          periodYear: runYear,
          periodMonth: runMonth,
        },
      },
      create: {
        orgId,
        fixedAssetId: asset.id,
        periodYear: runYear,
        periodMonth: runMonth,
        depreciationAmount: dep,
        bookValueAfter: bookAfter,
        status: "SCHEDULED",
      },
      update: {
        depreciationAmount: dep,
        bookValueAfter: bookAfter,
      },
    });

    await db.fixedAsset.update({
      where: { id: asset.id },
      data: {
        bookValue: bookAfter,
        status: bookAfter <= asset.salvageValue + 0.01 ? "FULLY_DEPRECIATED" : "ACTIVE",
      },
    });

    totalDepreciation += dep;
    lineDetails.push({
      assetTag: asset.assetTag,
      amount: dep,
      categoryCode: asset.category.code,
    });

    await db.depreciationSchedule.update({
      where: { id: schedule.id },
      data: { status: "POSTED" },
    });
  }

  let journalEntryId: string | undefined;
  if (totalDepreciation > 0) {
    const expenseByAccount = new Map<string, number>();
    for (const detail of lineDetails) {
      const asset = assets.find((a) => a.assetTag === detail.assetTag);
      if (!asset) continue;
      const code = asset.category.glExpenseAccountCode;
      expenseByAccount.set(code, (expenseByAccount.get(code) ?? 0) + detail.amount);
    }

    const lines = [
      ...[...expenseByAccount.entries()].map(([code, amount]) => ({
        accountCode: code,
        debit: amount,
        description: `Depreciation ${runYear}-${String(runMonth).padStart(2, "0")}`,
      })),
      {
        accountCode: "1510",
        credit: totalDepreciation,
        description: "Accumulated depreciation",
      },
    ];

    const entry = await postJournalEntry(
      {
        entryDate: new Date(runYear, runMonth - 1, 28),
        reference: `DEP-${runYear}${String(runMonth).padStart(2, "0")}`,
        memo: `Monthly depreciation run`,
        source: "DEPRECIATION",
        lines,
      },
      orgId,
    );
    journalEntryId = entry.id;
  }

  const run = await db.depreciationRun.upsert({
    where: { orgId_runYear_runMonth: { orgId, runYear, runMonth } },
    create: {
      orgId,
      runYear,
      runMonth,
      assetsProcessed: lineDetails.length,
      totalDepreciation,
      journalEntryId,
      status: "COMPLETED",
    },
    update: {
      assetsProcessed: lineDetails.length,
      totalDepreciation,
      journalEntryId,
      status: "COMPLETED",
    },
  });

  return { run, totalDepreciation, lineDetails, journalEntryId };
}
