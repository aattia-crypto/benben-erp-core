import type {
  Bom,
  BomLine,
  LaborEntry,
  MaterialUsage,
  ProductionBatch,
  ProductionStage,
} from "@prisma/client";

import { getPrisma } from "../database";
import { capitalizeWip } from "../finance/wip.service";
import { newId, parseDate, parseDateOnly, resolveOrgId, toDateOnlyString } from "./shared";

export type BomLineDto = {
  id: string;
  sku: string;
  material: string;
  qtyPerUnit: number;
  uom: string;
  unitCost: number;
};

export type BomVersionDto = {
  id: string;
  bomCode: string;
  name: string;
  version: string;
  productSku: string;
  effectiveFrom: string;
  lines: BomLineDto[];
  notes?: string;
};

export type ProductionStageDto = {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  startedAt?: string;
  completedAt?: string;
  laborHours: number;
  machineHours: number;
  laborCost: number;
  machineCost: number;
  yieldPct: number;
  scrapUnits: number;
};

export type ProductionBatchDto = {
  id: string;
  code: string;
  product: string;
  client: string;
  units: number;
  startedAt: string;
  expectedCompletion: string;
  cycleMonths: number;
  stages: ProductionStageDto[];
  wipValue: number;
  status: "planning" | "active" | "completed" | "on_hold";
};

export type MaterialUsageDto = {
  id: string;
  batchId: string;
  sku: string;
  qty: number;
  at: string;
};

export type LaborEntryDto = {
  id: string;
  batchId: string;
  stageId: string;
  hours: number;
  rate: number;
  at: string;
};

export type ManufacturingStateDto = {
  batches: ProductionBatchDto[];
  boms: BomVersionDto[];
  materialUsage: MaterialUsageDto[];
  labor: LaborEntryDto[];
};

export type NewBatchInputDto = {
  product: string;
  client: string;
  units: number;
  cycleMonths: number;
  expectedCompletion: string;
};

const DEFAULT_STAGE_NAMES = [
  "Substrate Prep",
  "Photolithography",
  "Etch & Deposition",
  "Doping",
  "Metallization",
  "Test & Burn-In",
  "Final QA / Packaging",
];

function toStageDto(row: ProductionStage): ProductionStageDto {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ProductionStageDto["status"],
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    laborHours: row.laborHours,
    machineHours: row.machineHours,
    laborCost: row.laborCost,
    machineCost: row.machineCost,
    yieldPct: row.yieldPct,
    scrapUnits: row.scrapUnits,
  };
}

function toBatchDto(batch: ProductionBatch & { stages: ProductionStage[] }): ProductionBatchDto {
  return {
    id: batch.id,
    code: batch.code,
    product: batch.product,
    client: batch.client,
    units: batch.units,
    startedAt: toDateOnlyString(batch.startedAt),
    expectedCompletion: toDateOnlyString(batch.expectedCompletion),
    cycleMonths: batch.cycleMonths,
    stages: batch.stages.sort((a, b) => a.sortOrder - b.sortOrder).map(toStageDto),
    wipValue: batch.wipValue,
    status: batch.status as ProductionBatchDto["status"],
  };
}

function toBomLineDto(row: BomLine): BomLineDto {
  return {
    id: row.id,
    sku: row.sku,
    material: row.material,
    qtyPerUnit: row.qtyPerUnit,
    uom: row.uom,
    unitCost: row.unitCost,
  };
}

function toBomDto(bom: Bom & { lines: BomLine[] }): BomVersionDto {
  return {
    id: bom.id,
    bomCode: bom.bomCode,
    name: bom.name,
    version: bom.version,
    productSku: bom.productSku,
    effectiveFrom: toDateOnlyString(bom.effectiveFrom),
    lines: bom.lines.map(toBomLineDto),
    notes: bom.notes ?? undefined,
  };
}

export async function getManufacturingState(orgId = resolveOrgId()): Promise<ManufacturingStateDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const [batches, boms, materialUsage, labor] = await Promise.all([
    db.productionBatch.findMany({
      where: { orgId: org },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    db.bom.findMany({
      where: { orgId: org },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    }),
    db.materialUsage.findMany({ where: { orgId: org }, orderBy: { usedAt: "desc" } }),
    db.laborEntry.findMany({ where: { orgId: org }, orderBy: { loggedAt: "desc" } }),
  ]);

  return {
    batches: batches.map(toBatchDto),
    boms: boms.map(toBomDto),
    materialUsage: materialUsage.map((u) => ({
      id: u.id,
      batchId: u.batchId,
      sku: u.sku,
      qty: u.qty,
      at: u.usedAt.toISOString(),
    })),
    labor: labor.map((l) => ({
      id: l.id,
      batchId: l.batchId,
      stageId: l.stageId,
      hours: l.hours,
      rate: l.rate,
      at: l.loggedAt.toISOString(),
    })),
  };
}

export async function createBatch(orgId: string, input: NewBatchInputDto): Promise<ProductionBatchDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const count = await db.productionBatch.count({ where: { orgId: org } });
  const year = new Date().getFullYear().toString().slice(2);
  const seq = String(count + 1).padStart(4, "0");
  const batchId = newId("b");

  const batch = await db.$transaction(async (tx) => {
    const created = await tx.productionBatch.create({
      data: {
        id: batchId,
        orgId: org,
        code: `PB-${year}-${seq}`,
        product: input.product.trim(),
        client: input.client.trim(),
        units: input.units,
        startedAt: parseDateOnly(new Date().toISOString().slice(0, 10)),
        expectedCompletion: parseDateOnly(input.expectedCompletion),
        cycleMonths: input.cycleMonths,
        wipValue: 0,
        status: "planning",
      },
    });

    const stages = await Promise.all(
      DEFAULT_STAGE_NAMES.map((name, index) =>
        tx.productionStage.create({
          data: {
            id: newId("st"),
            orgId: org,
            batchId: created.id,
            sortOrder: index,
            name,
            status: "pending",
          },
        }),
      ),
    );

    return { ...created, stages };
  });

  return toBatchDto(batch);
}

export async function updateBatchStatus(
  orgId: string,
  batchId: string,
  status: ProductionBatchDto["status"],
): Promise<ProductionBatchDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.productionBatch.update({
    where: { id: batchId },
    data: { status },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
  if (row.orgId !== org) throw new Error("Batch not found.");
  return toBatchDto(row);
}

export async function updateStageStatus(
  orgId: string,
  batchId: string,
  stageId: string,
  status: ProductionStageDto["status"],
): Promise<ProductionBatchDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);

  return db.$transaction(async (tx) => {
    await tx.productionStage.update({
      where: { id: stageId },
      data: { status },
    });

    if (status === "in_progress") {
      await tx.productionBatch.update({
        where: { id: batchId },
        data: { status: "active" },
      });
    }

    const batch = await tx.productionBatch.findFirst({
      where: { id: batchId, orgId: org },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!batch) throw new Error("Batch not found.");
    return toBatchDto(batch);
  });
}

export async function recordMaterialUsage(
  orgId: string,
  batchId: string,
  sku: string,
  qty: number,
): Promise<MaterialUsageDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.materialUsage.create({
    data: {
      id: newId("mu"),
      orgId: org,
      batchId,
      sku: sku.trim(),
      qty,
      usedAt: new Date(),
    },
  });

  const item = await db.inventoryItem.findFirst({
    where: { orgId: org, sku: sku.trim() },
    select: { unitCost: true },
  });
  const materialCost = Math.round(qty * (item?.unitCost ?? 0) * 100) / 100;

  if (materialCost > 0) {
    const batch = await db.productionBatch.findUnique({ where: { id: batchId } });
    await capitalizeWip({
      amount: materialCost,
      creditAccountCode: "5000",
      batchId,
      batchCode: batch?.code,
      memo: `Material to WIP · ${sku.trim()} × ${qty}`,
      sourceRef: row.id,
      idempotencyKey: `wip-material-${row.id}`,
    });
    await db.productionBatch.update({
      where: { id: batchId },
      data: { wipValue: { increment: materialCost } },
    });
  }

  return {
    id: row.id,
    batchId: row.batchId,
    sku: row.sku,
    qty: row.qty,
    at: row.usedAt.toISOString(),
  };
}

export async function recordLabor(
  orgId: string,
  batchId: string,
  stageId: string,
  hours: number,
  rate = 78,
): Promise<{ entry: LaborEntryDto; batch: ProductionBatchDto }> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const laborCost = hours * rate;

  return db.$transaction(async (tx) => {
    const entry = await tx.laborEntry.create({
      data: {
        id: newId("lb"),
        orgId: org,
        batchId,
        stageId,
        hours,
        rate,
        loggedAt: new Date(),
      },
    });

    const stage = await tx.productionStage.findUnique({ where: { id: stageId } });
    if (stage) {
      const nextStatus = stage.status === "pending" ? "in_progress" : stage.status;
      await tx.productionStage.update({
        where: { id: stageId },
        data: {
          laborHours: stage.laborHours + hours,
          laborCost: stage.laborCost + laborCost,
          status: nextStatus,
        },
      });
    }

    const batch = await tx.productionBatch.findUnique({ where: { id: batchId } });
    if (batch) {
      await tx.productionBatch.update({
        where: { id: batchId },
        data: { wipValue: batch.wipValue + laborCost },
      });
    }

    const updated = await tx.productionBatch.findFirst({
      where: { id: batchId, orgId: org },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!updated) throw new Error("Batch not found.");

    await capitalizeWip({
      amount: laborCost,
      creditAccountCode: "5000",
      batchId,
      batchCode: updated.code,
      memo: `Labor to WIP · ${hours}h @ ${rate}`,
      sourceRef: entry.id,
      idempotencyKey: `wip-labor-${entry.id}`,
    });

    return {
      entry: {
        id: entry.id,
        batchId: entry.batchId,
        stageId: entry.stageId,
        hours: entry.hours,
        rate: entry.rate,
        at: entry.loggedAt.toISOString(),
      },
      batch: toBatchDto(updated),
    };
  });
}

export async function saveBom(
  orgId: string,
  bom: Omit<BomVersionDto, "id"> & { id?: string },
): Promise<BomVersionDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const bomId = bom.id ?? newId("bom");
  const bomCode = bom.bomCode?.trim() || `BOM-${bom.productSku}`;
  const name = bom.name?.trim() || bom.productSku;
  const version = bom.version || "1.0";

  return db.$transaction(async (tx) => {
    await tx.bom.upsert({
      where: { id: bomId },
      create: {
        id: bomId,
        orgId: org,
        bomCode,
        name,
        version,
        productSku: bom.productSku,
        effectiveFrom: parseDateOnly(bom.effectiveFrom),
        notes: bom.notes ?? null,
      },
      update: {
        bomCode,
        name,
        version,
        productSku: bom.productSku,
        effectiveFrom: parseDateOnly(bom.effectiveFrom),
        notes: bom.notes ?? null,
      },
    });

    await tx.bomLine.deleteMany({ where: { bomId } });
    for (const line of bom.lines) {
      await tx.bomLine.create({
        data: {
          id: line.id || newId("bl"),
          orgId: org,
          bomId,
          sku: line.sku,
          material: line.material,
          qtyPerUnit: line.qtyPerUnit,
          uom: line.uom,
          unitCost: line.unitCost,
        },
      });
    }

    const saved = await tx.bom.findUnique({
      where: { id: bomId },
      include: { lines: true },
    });
    if (!saved) throw new Error("BOM save failed.");
    return toBomDto(saved);
  });
}

export async function createBomVersion(
  orgId: string,
  productSku: string,
  lines: BomLineDto[],
  notes?: string,
  meta?: { bomCode?: string; name?: string },
): Promise<BomVersionDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const prev = await db.bom.count({ where: { orgId: org, productSku } });
  const major = prev + 1;
  return saveBom(orgId, {
    bomCode: meta?.bomCode ?? `BOM-${productSku}`,
    name: meta?.name ?? productSku,
    version: `${major}.0`,
    productSku,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    lines,
    notes,
  });
}
