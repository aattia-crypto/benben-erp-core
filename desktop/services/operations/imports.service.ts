import type { ImportAttachmentMeta, ImportShipment, ImportShipmentLine } from "@prisma/client";

import { getPrisma } from "../database";
import { applyWeightedUnitCosts } from "./inventory.service";
import { newId, parseDate, parseDateOnly, resolveOrgId, toDateOnlyString } from "./shared";

export type ImportLineDto = {
  id: string;
  sku: string;
  description: string;
  qty: number;
  unitValue: number;
};

export type ImportShipmentDto = {
  id: string;
  reference: string;
  origin: string;
  destination: string;
  status: "booked" | "in_transit" | "customs" | "delivered";
  customsTariffPct: number;
  customsFees: number;
  freightCost: number;
  insuranceCost: number;
  landedCost: number;
  lines: ImportLineDto[];
  eta: string;
  landedCostApplied?: boolean;
  attachments: { id: string; name: string; size: number; at: string }[];
};

function merchandiseValue(shipment: Pick<ImportShipmentDto, "lines">): number {
  return shipment.lines.reduce((s, l) => s + l.qty * l.unitValue, 0);
}

export function computeLandedCost(
  shipment: Pick<
    ImportShipmentDto,
    "lines" | "customsTariffPct" | "customsFees" | "freightCost" | "insuranceCost"
  >,
): number {
  const fob = merchandiseValue(shipment);
  const duty = fob * (shipment.customsTariffPct / 100);
  return Math.round((fob + duty + shipment.customsFees + shipment.freightCost + shipment.insuranceCost) * 100) / 100;
}

function toShipmentDto(
  row: ImportShipment & { lines: ImportShipmentLine[]; attachments: ImportAttachmentMeta[] },
): ImportShipmentDto {
  const dto: ImportShipmentDto = {
    id: row.id,
    reference: row.reference,
    origin: row.origin,
    destination: row.destination,
    status: row.status as ImportShipmentDto["status"],
    customsTariffPct: row.customsTariffPct,
    customsFees: row.customsFees,
    freightCost: row.freightCost,
    insuranceCost: row.insuranceCost,
    landedCost: row.landedCost,
    lines: row.lines.map((l) => ({
      id: l.id,
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitValue: l.unitValue,
    })),
    eta: toDateOnlyString(row.eta),
    landedCostApplied: row.landedCostApplied,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.sizeBytes,
      at: a.attachedAt.toISOString(),
    })),
  };
  return { ...dto, landedCost: computeLandedCost(dto) };
}

export async function listShipments(orgId = resolveOrgId()): Promise<ImportShipmentDto[]> {
  const db = getPrisma();
  const rows = await db.importShipment.findMany({
    where: { orgId: resolveOrgId(orgId) },
    include: { lines: true, attachments: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toShipmentDto);
}

export async function createShipment(
  orgId: string,
  shipment: ImportShipmentDto,
): Promise<ImportShipmentDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const id = shipment.id || newId("sh");
  const landedCost = computeLandedCost({ ...shipment, lines: shipment.lines });

  const row = await db.$transaction(async (tx) => {
    const created = await tx.importShipment.create({
      data: {
        id,
        orgId: org,
        reference: shipment.reference,
        origin: shipment.origin,
        destination: shipment.destination,
        status: shipment.status,
        customsTariffPct: shipment.customsTariffPct,
        customsFees: shipment.customsFees,
        freightCost: shipment.freightCost,
        insuranceCost: shipment.insuranceCost,
        landedCost,
        eta: parseDateOnly(shipment.eta),
        landedCostApplied: shipment.landedCostApplied ?? false,
      },
    });

    for (const line of shipment.lines) {
      const sku = line.sku?.trim();
      if (!sku) throw new Error(`Import line missing SKU on shipment ${shipment.reference}.`);
      await tx.importShipmentLine.create({
        data: {
          id: line.id || newId("il"),
          orgId: org,
          shipmentId: created.id,
          sku,
          description: line.description,
          qty: line.qty,
          unitValue: line.unitValue,
        },
      });
    }

    return tx.importShipment.findUnique({
      where: { id: created.id },
      include: { lines: true, attachments: true },
    });
  });

  if (!row) throw new Error("Shipment create failed.");
  return toShipmentDto(row);
}

export async function updateShipment(
  orgId: string,
  id: string,
  patch: Partial<ImportShipmentDto>,
): Promise<ImportShipmentDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await db.importShipment.findFirst({
    where: { id, orgId: org },
    include: { lines: true, attachments: true },
  });
  if (!existing) throw new Error("Shipment not found.");

  const merged: ImportShipmentDto = {
    ...toShipmentDto(existing),
    ...patch,
    lines: patch.lines ?? toShipmentDto(existing).lines,
  };
  const landedCost = computeLandedCost(merged);

  const row = await db.$transaction(async (tx) => {
    await tx.importShipment.update({
      where: { id },
      data: {
        reference: merged.reference,
        origin: merged.origin,
        destination: merged.destination,
        status: merged.status,
        customsTariffPct: merged.customsTariffPct,
        customsFees: merged.customsFees,
        freightCost: merged.freightCost,
        insuranceCost: merged.insuranceCost,
        landedCost,
        eta: parseDateOnly(merged.eta),
        landedCostApplied: merged.landedCostApplied ?? existing.landedCostApplied,
      },
    });

    if (patch.lines) {
      await tx.importShipmentLine.deleteMany({ where: { shipmentId: id } });
      for (const line of patch.lines) {
        await tx.importShipmentLine.create({
          data: {
            id: line.id || newId("il"),
            orgId: org,
            shipmentId: id,
            sku: line.sku,
            description: line.description,
            qty: line.qty,
            unitValue: line.unitValue,
          },
        });
      }
    }

    const updated = await tx.importShipment.findUnique({
      where: { id },
      include: { lines: true, attachments: true },
    });
    if (!updated) throw new Error("Shipment update failed.");
    return updated;
  });

  return toShipmentDto(row);
}

export async function attachFile(
  orgId: string,
  shipmentId: string,
  name: string,
  size: number,
): Promise<ImportShipmentDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  await db.importAttachmentMeta.create({
    data: {
      id: newId("att"),
      orgId: org,
      shipmentId,
      name,
      sizeBytes: size,
      attachedAt: new Date(),
    },
  });

  const row = await db.importShipment.findFirst({
    where: { id: shipmentId, orgId: org },
    include: { lines: true, attachments: true },
  });
  if (!row) throw new Error("Shipment not found.");
  return toShipmentDto(row);
}

export async function applyLandedCostToInventory(
  orgId: string,
  shipmentId: string,
): Promise<ImportShipmentDto | null> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await db.importShipment.findFirst({
    where: { id: shipmentId, orgId: org },
    include: { lines: true, attachments: true },
  });
  if (!existing || existing.landedCostApplied) return null;

  const dto = toShipmentDto(existing);
  const fob = merchandiseValue(dto);
  if (fob <= 0) return null;

  const total = computeLandedCost(dto);
  const allocations = dto.lines.map((l) => {
    const lineFob = l.qty * l.unitValue;
    const share = lineFob / fob;
    const allocated = total * share;
    const landedUnit = l.qty > 0 ? allocated / l.qty : l.unitValue;
    return { sku: l.sku, landedUnitCost: Math.round(landedUnit * 100) / 100 };
  });

  await applyWeightedUnitCosts(org, allocations, `Import ${dto.reference} landed cost`);

  const row = await db.importShipment.update({
    where: { id: shipmentId },
    data: { landedCostApplied: true, status: "delivered", landedCost: total },
    include: { lines: true, attachments: true },
  });

  return toShipmentDto(row);
}
