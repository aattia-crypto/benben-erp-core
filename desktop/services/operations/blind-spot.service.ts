import fs from "node:fs";
import path from "node:path";

import { getPrisma } from "../database";
import { getBlindSpotMediaRoot } from "../../utils/paths";
import { newId, parseDate, resolveOrgId } from "./shared";

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv", ".m4v"]);

export type BlindSpotSeverity = "low" | "medium" | "high";
export type BlindSpotCategory = "operational" | "delivery" | "quality" | "client";

export type BlindSpotEntryDto = {
  id: string;
  title: string;
  body: string;
  severity: BlindSpotSeverity;
  category: BlindSpotCategory;
  partyId?: string;
  customerCode?: string;
  sku?: string;
  videoFilePath?: string;
  voiceTranscript?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type BlindSpotQueryDto = {
  entityId?: string;
  customerCode?: string;
  sku?: string;
  skus?: string[];
};

function toDto(row: {
  id: string;
  title: string;
  body: string;
  severity: string;
  category: string;
  partyId: string | null;
  customerCode: string | null;
  sku: string | null;
  videoFilePath: string | null;
  voiceTranscript: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BlindSpotEntryDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity as BlindSpotSeverity,
    category: row.category as BlindSpotCategory,
    partyId: row.partyId ?? undefined,
    customerCode: row.customerCode ?? undefined,
    sku: row.sku ?? undefined,
    videoFilePath: row.videoFilePath ?? undefined,
    voiceTranscript: row.voiceTranscript ?? undefined,
    createdBy: row.createdBy ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolveBody(entry: Pick<BlindSpotEntryDto, "body" | "videoFilePath" | "voiceTranscript">): string {
  const body = entry.body?.trim();
  if (body) return body;
  const transcript = entry.voiceTranscript?.trim();
  if (transcript) return transcript;
  if (entry.videoFilePath?.trim()) return "Video tip";
  throw new Error("Title and either context text or a video clip are required.");
}

function normalizeSku(sku?: string): string | undefined {
  const v = sku?.trim().toUpperCase();
  return v || undefined;
}

function normalizeCode(code?: string): string | undefined {
  const v = code?.trim().toUpperCase();
  return v || undefined;
}

function sanitizeBlindSpotMediaId(entryId: string): string {
  const id = entryId.trim();
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid blind-spot entry id for media upload.");
  }
  return id;
}

/** Copy a video clip into AppData/local-media/blindspots/{entryId}/. */
export function uploadBlindSpotVideo(entryId: string, sourcePath: string): string {
  const id = sanitizeBlindSpotMediaId(entryId);
  const abs = path.resolve(sourcePath.trim());
  if (!fs.existsSync(abs)) throw new Error("Video file not found.");
  if (!fs.statSync(abs).isFile()) throw new Error("Video path is not a file.");
  const ext = path.extname(abs).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported video format (${ext || "unknown"}). Use MP4, WebM, or MOV.`);
  }

  const destDir = path.join(getBlindSpotMediaRoot(), id);
  fs.mkdirSync(destDir, { recursive: true });
  const baseName = path.basename(abs);
  let destFile = path.join(destDir, baseName);
  if (fs.existsSync(destFile)) {
    const stamp = Date.now();
    destFile = path.join(destDir, `${path.parse(baseName).name}-${stamp}${path.extname(baseName)}`);
  }
  fs.copyFileSync(abs, destFile);
  return path.posix.join("blindspots", id, path.basename(destFile));
}

function removeBlindSpotMedia(entryId: string): void {
  const id = sanitizeBlindSpotMediaId(entryId);
  const dir = path.join(getBlindSpotMediaRoot(), id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export async function createEntry(orgId: string, entry: BlindSpotEntryDto): Promise<BlindSpotEntryDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const id = entry.id || newId("bs");
  const sku = normalizeSku(entry.sku);
  const customerCode = normalizeCode(entry.customerCode);

  if (entry.partyId) {
    const party = await db.crmParty.findFirst({ where: { id: entry.partyId, orgId: org } });
    if (!party) throw new Error("Linked CRM account not found.");
  }

  const row = await db.blindSpotEntry.upsert({
    where: { id },
    create: {
      id,
      orgId: org,
      title: entry.title.trim(),
      body: resolveBody(entry),
      severity: entry.severity,
      category: entry.category || "operational",
      partyId: entry.partyId ?? null,
      customerCode: customerCode ?? null,
      sku: sku ?? null,
      videoFilePath: entry.videoFilePath?.trim() || null,
      voiceTranscript: entry.voiceTranscript?.trim() || null,
      createdBy: entry.createdBy ?? null,
      createdAt: entry.createdAt ? parseDate(entry.createdAt) : new Date(),
      updatedAt: entry.updatedAt ? parseDate(entry.updatedAt) : new Date(),
    },
    update: {
      title: entry.title.trim(),
      body: resolveBody(entry),
      severity: entry.severity,
      category: entry.category || "operational",
      partyId: entry.partyId ?? null,
      customerCode: customerCode ?? null,
      sku: sku ?? null,
      videoFilePath: entry.videoFilePath?.trim() || null,
      voiceTranscript: entry.voiceTranscript?.trim() || null,
      createdBy: entry.createdBy ?? null,
      updatedAt: new Date(),
    },
  });

  return toDto(row);
}

export async function updateEntry(
  orgId: string,
  id: string,
  patch: Partial<Omit<BlindSpotEntryDto, "id" | "createdAt" | "updatedAt">>,
): Promise<BlindSpotEntryDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await db.blindSpotEntry.findFirst({ where: { id, orgId: org } });
  if (!existing) throw new Error("Blind-spot entry not found.");

  if (patch.partyId) {
    const party = await db.crmParty.findFirst({ where: { id: patch.partyId, orgId: org } });
    if (!party) throw new Error("Linked CRM account not found.");
  }

  const row = await db.blindSpotEntry.update({
    where: { id },
    data: {
      title: patch.title?.trim() ?? existing.title,
      body:
        patch.body !== undefined || patch.videoFilePath !== undefined || patch.voiceTranscript !== undefined
          ? resolveBody({
              body: patch.body ?? existing.body,
              videoFilePath: patch.videoFilePath ?? existing.videoFilePath ?? undefined,
              voiceTranscript: patch.voiceTranscript ?? existing.voiceTranscript ?? undefined,
            })
          : existing.body,
      severity: patch.severity ?? existing.severity,
      category: patch.category ?? existing.category,
      partyId: patch.partyId !== undefined ? patch.partyId : existing.partyId,
      customerCode:
        patch.customerCode !== undefined ? normalizeCode(patch.customerCode) ?? null : existing.customerCode,
      sku: patch.sku !== undefined ? normalizeSku(patch.sku) ?? null : existing.sku,
      videoFilePath:
        patch.videoFilePath !== undefined ? patch.videoFilePath?.trim() || null : existing.videoFilePath,
      voiceTranscript:
        patch.voiceTranscript !== undefined ? patch.voiceTranscript?.trim() || null : existing.voiceTranscript,
      createdBy: patch.createdBy !== undefined ? patch.createdBy : existing.createdBy,
      updatedAt: new Date(),
    },
  });

  return toDto(row);
}

/** Match ledger rows for CRM account and/or inventory SKU context. Empty query returns all org entries. */
export async function getForEntity(orgId: string, query: BlindSpotQueryDto = {}): Promise<BlindSpotEntryDto[]> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const entityId = query.entityId?.trim();
  const customerCode = normalizeCode(query.customerCode);
  const sku = normalizeSku(query.sku);
  const skus = (query.skus ?? []).map((s) => normalizeSku(s)).filter(Boolean) as string[];

  const hasFilter = !!(entityId || customerCode || sku || skus.length);
  if (!hasFilter) {
    const rows = await db.blindSpotEntry.findMany({
      where: { orgId: org },
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
    });
    return rows.map(toDto);
  }

  const or: Array<{ partyId?: string; customerCode?: string; sku?: string }> = [];
  if (entityId) or.push({ partyId: entityId });
  if (customerCode) or.push({ customerCode });
  if (sku) or.push({ sku });
  for (const s of skus) {
    if (!or.some((x) => x.sku === s)) or.push({ sku: s });
  }

  const rows = await db.blindSpotEntry.findMany({
    where: { orgId: org, OR: or },
    orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
  });

  const globalRows = await db.blindSpotEntry.findMany({
    where: {
      orgId: org,
      partyId: null,
      customerCode: null,
      sku: null,
    },
    orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
  });

  const merged = new Map<string, ReturnType<typeof toDto>>();
  for (const row of [...rows, ...globalRows]) {
    merged.set(row.id, toDto(row));
  }
  return [...merged.values()];
}

export async function deleteEntry(orgId: string, id: string): Promise<void> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await db.blindSpotEntry.findFirst({ where: { id, orgId: org } });
  if (!existing) throw new Error("Blind-spot entry not found.");
  await db.blindSpotEntry.delete({ where: { id } });
  try {
    removeBlindSpotMedia(id);
  } catch {
    // non-fatal if media folder missing
  }
}
