import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { getPrisma } from "../database";
import {
  DEFAULT_ORG_ID,
  type LocationInputDto,
  type StockLocationDto,
  encodeRegisters,
  parseRegisters,
  toStockLocationDto,
} from "./types";

function newLocationId(): string {
  return `loc_${randomBytes(4).toString("hex").slice(0, 8)}`;
}

function resolveOrgId(orgId?: string): string {
  const id = orgId?.trim();
  return id || DEFAULT_ORG_ID;
}

function normalizeLocationInput(input: LocationInputDto): LocationInputDto {
  return {
    ...input,
    registers: input.registers ?? ["Register 1"],
  };
}

export async function listLocations(
  orgId = DEFAULT_ORG_ID,
  includeArchived = false,
): Promise<StockLocationDto[]> {
  const db = getPrisma();
  const where: Prisma.StockLocationWhereInput = { orgId: resolveOrgId(orgId) };
  if (!includeArchived) where.isActive = true;

  const rows = await db.stockLocation.findMany({
    where,
    orderBy: { label: "asc" },
  });
  return rows.map(toStockLocationDto);
}

export async function getLocationById(
  orgId = DEFAULT_ORG_ID,
  id: string,
): Promise<StockLocationDto | null> {
  const db = getPrisma();
  const row = await db.stockLocation.findFirst({
    where: { id, orgId: resolveOrgId(orgId) },
  });
  return row ? toStockLocationDto(row) : null;
}

export async function createLocation(
  orgId = DEFAULT_ORG_ID,
  input: LocationInputDto,
  explicitId?: string,
): Promise<StockLocationDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const normalized = normalizeLocationInput(input);
  const label = normalized.label.trim();
  if (!label) throw new Error("Location label is required.");

  const id = explicitId?.trim() || newLocationId();
  const existing = await db.stockLocation.findUnique({ where: { id } });
  if (existing) throw new Error(`Location id already exists: ${id}`);

  const row = await db.stockLocation.create({
    data: {
      id,
      orgId: org,
      label,
      kind: normalized.kind,
      taxState: normalized.taxState?.trim() || null,
      address: normalized.address?.trim() || null,
      phone: normalized.phone?.trim() || null,
      warehouseId: normalized.warehouseId?.trim() || null,
      registers: encodeRegisters(normalized.registers),
      managerName: normalized.managerName?.trim() || null,
      isActive: true,
    },
  });
  return toStockLocationDto(row);
}

export async function updateLocation(
  orgId = DEFAULT_ORG_ID,
  id: string,
  patch: Partial<LocationInputDto & { active: boolean }>,
): Promise<StockLocationDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await db.stockLocation.findFirst({ where: { id, orgId: org } });
  if (!existing) throw new Error("Location not found.");

  const data: Prisma.StockLocationUpdateInput = {};
  if (patch.label !== undefined) data.label = patch.label.trim();
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.taxState !== undefined) data.taxState = patch.taxState?.trim() || null;
  if (patch.address !== undefined) data.address = patch.address?.trim() || null;
  if (patch.phone !== undefined) data.phone = patch.phone?.trim() || null;
  if (patch.warehouseId !== undefined) data.warehouseId = patch.warehouseId?.trim() || null;
  if (patch.registers !== undefined) {
    data.registers = encodeRegisters(patch.registers ?? parseRegisters(existing.registers));
  }
  if (patch.managerName !== undefined) data.managerName = patch.managerName?.trim() || null;
  if (patch.active !== undefined) data.isActive = patch.active;

  const row = await db.stockLocation.update({ where: { id }, data });
  return toStockLocationDto(row);
}

export async function archiveLocation(orgId = DEFAULT_ORG_ID, id: string): Promise<StockLocationDto> {
  return updateLocation(orgId, id, { active: false });
}
