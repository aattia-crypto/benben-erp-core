import { getPrisma } from "../database";
import { ORG_DEFAULT, type TaxCalculateInput } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export async function ensureDefaultTaxZone(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const zone = await db.taxZone.upsert({
    where: { orgId_code: { orgId, code: "US-DEFAULT" } },
    create: {
      orgId,
      code: "US-DEFAULT",
      name: "US Default Sales Tax",
      country: "US",
      isActive: true,
    },
    update: {},
  });

  const existingRate = await db.taxRate.findFirst({
    where: { taxZoneId: zone.id, taxCategory: "STANDARD", isActive: true },
  });
  if (!existingRate) {
    await db.taxRate.create({
      data: {
        orgId,
        taxZoneId: zone.id,
        name: "Standard Rate",
        rate: 0.0825,
        taxCategory: "STANDARD",
        effectiveFrom: new Date("2020-01-01"),
        isActive: true,
      },
    });
  }
  return zone;
}

async function resolveTaxZone(
  input: TaxCalculateInput,
  orgId: string,
) {
  const db = getPrisma();
  if (input.taxZoneCode) {
    const zone = await db.taxZone.findFirst({
      where: { orgId, code: input.taxZoneCode, isActive: true },
    });
    if (!zone) throw new Error(`Tax zone not found: ${input.taxZoneCode}`);
    return zone;
  }
  return ensureDefaultTaxZone(orgId);
}

async function resolveRate(
  taxZoneId: string,
  taxCategory: string,
  asOf: Date,
  orgId: string,
) {
  const db = getPrisma();
  const rate = await db.taxRate.findFirst({
    where: {
      orgId,
      taxZoneId,
      taxCategory,
      isActive: true,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!rate) {
    if (taxCategory === "EXEMPT" || taxCategory === "ZERO") {
      return { name: taxCategory, rate: 0, taxCategory, rateId: null };
    }
    throw new Error(`No tax rate for category ${taxCategory}`);
  }
  return {
    name: rate.name,
    rate: rate.rate,
    taxCategory: rate.taxCategory,
    rateId: rate.id,
  };
}

export async function calculateTransactionTax(
  input: TaxCalculateInput,
  orgId = ORG_DEFAULT,
) {
  const zone = await resolveTaxZone(input, orgId);
  const asOf = new Date();
  const lineResults = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (const line of input.lines) {
    const category = line.taxCategory ?? "STANDARD";
    const rateInfo = await resolveRate(zone.id, category, asOf, orgId);
    const taxable = category === "EXEMPT" || category === "ZERO" ? 0 : line.amount;
    const taxAmount = ROUND(taxable * rateInfo.rate);
    subtotal += line.amount;
    taxTotal += taxAmount;

    lineResults.push({
      lineId: line.lineId,
      amount: line.amount,
      taxCategory: category,
      appliedRate: rateInfo.rate,
      appliedRateName: rateInfo.name,
      taxAmount,
      taxZoneCode: zone.code,
      rateId: rateInfo.rateId,
    });
  }

  subtotal = ROUND(subtotal);
  taxTotal = ROUND(taxTotal);
  const grandTotal = ROUND(subtotal + taxTotal);

  const snapshotPayload = {
    calculatedAt: asOf.toISOString(),
    originAddress: input.originAddress,
    destinationAddress: input.destinationAddress,
    taxZone: { code: zone.code, name: zone.name },
    lines: lineResults,
    subtotal,
    taxTotal,
    grandTotal,
  };

  let snapshotId: string | undefined;
  if (input.persistSnapshot && input.invoiceRef) {
    const db = getPrisma();
    const snap = await db.taxInvoiceSnapshot.create({
      data: {
        orgId,
        invoiceRef: input.invoiceRef,
        originAddress: input.originAddress,
        destinationAddress: input.destinationAddress,
        subtotal,
        taxTotal,
        grandTotal,
        snapshotJson: JSON.stringify(snapshotPayload),
      },
    });
    snapshotId = snap.id;

    await db.taxAuditLog.create({
      data: {
        orgId,
        action: "TAX_SNAPSHOT_CREATED",
        entityRef: input.invoiceRef,
        payloadJson: JSON.stringify({ snapshotId: snap.id }),
      },
    });
  }

  await getPrisma().taxAuditLog.create({
    data: {
      orgId,
      action: "TAX_CALCULATED",
      entityRef: input.invoiceRef,
      payloadJson: JSON.stringify({ subtotal, taxTotal, zoneCode: zone.code }),
    },
  });

  return {
    subtotal,
    taxTotal,
    grandTotal,
    lines: lineResults,
    snapshotId,
    snapshot: snapshotPayload,
  };
}

export async function getTaxSummaryReport(
  params: { from: string; to: string },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const from = new Date(params.from);
  const to = new Date(params.to);

  const snapshots = await db.taxInvoiceSnapshot.findMany({
    where: { orgId, createdAt: { gte: from, lte: to } },
  });

  const byZone = new Map<string, { subtotal: number; tax: number; count: number }>();

  for (const snap of snapshots) {
    let zoneCode = "UNKNOWN";
    try {
      const parsed = JSON.parse(snap.snapshotJson) as { taxZone?: { code?: string } };
      zoneCode = parsed.taxZone?.code ?? "UNKNOWN";
    } catch {
      /* ignore parse errors */
    }
    const bucket = byZone.get(zoneCode) ?? { subtotal: 0, tax: 0, count: 0 };
    bucket.subtotal += snap.subtotal;
    bucket.tax += snap.taxTotal;
    bucket.count += 1;
    byZone.set(zoneCode, bucket);
  }

  return {
    period: { from: params.from, to: params.to },
    invoiceCount: snapshots.length,
    totals: {
      subtotal: ROUND(snapshots.reduce((s, x) => s + x.subtotal, 0)),
      tax: ROUND(snapshots.reduce((s, x) => s + x.taxTotal, 0)),
    },
    byZone: [...byZone.entries()].map(([zoneCode, v]) => ({
      zoneCode,
      ...v,
      subtotal: ROUND(v.subtotal),
      tax: ROUND(v.tax),
    })),
  };
}
