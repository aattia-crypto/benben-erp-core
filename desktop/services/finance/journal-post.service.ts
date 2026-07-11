import crypto from "node:crypto";

import { getPrisma } from "../database";
import { logger } from "../../utils/logger";
import { logActivity } from "../audit.service";
import { postJournalEntry } from "./gl.service";
import { ORG_DEFAULT, type JournalLineInput, type PostJournalInput } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export type JournalPostContext = {
  memo: string;
  lines: JournalLineInput[];
  source: string;
  module: string;
  reference?: string;
  entryDate?: Date;
  idempotencyKey?: string;
  userId?: string;
};

function buildFingerprint(ctx: JournalPostContext, orgId: string): string {
  const payload = JSON.stringify({
    orgId,
    memo: ctx.memo,
    source: ctx.source,
    module: ctx.module,
    reference: ctx.reference,
    idempotencyKey: ctx.idempotencyKey,
    lines: ctx.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: ROUND(l.debit ?? 0),
      credit: ROUND(l.credit ?? 0),
    })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function postJournalWithIntegrity(
  ctx: JournalPostContext,
  orgId = ORG_DEFAULT,
): Promise<{ id: string; duplicate: boolean }> {
  const db = getPrisma();
  const fingerprint = ctx.idempotencyKey ?? buildFingerprint(ctx, orgId);

  const existing = await db.glPostingFingerprint.findUnique({
    where: { orgId_fingerprint: { orgId, fingerprint } },
  });

  if (existing) {
    logger.warn("Duplicate journal post prevented", {
      module: ctx.module,
      source: ctx.source,
      reference: ctx.reference,
      journalEntryId: existing.journalEntryId,
    });
    return { id: existing.journalEntryId, duplicate: true };
  }

  const input: PostJournalInput = {
    entryDate: ctx.entryDate ?? new Date(),
    reference: ctx.reference,
    memo: ctx.memo,
    source: ctx.source,
    lines: ctx.lines,
  };

  try {
    const entry = await postJournalEntry(input, orgId);

    await db.glPostingFingerprint.create({
      data: {
        orgId,
        fingerprint,
        journalEntryId: entry.id,
        module: ctx.module,
      },
    });

    await logActivity({
      orgId,
      userId: ctx.userId,
      module: ctx.module,
      action: "GL_POST",
      entityType: "GlJournalEntry",
      entityId: entry.id,
      summary: ctx.memo,
      afterJson: JSON.stringify({ source: ctx.source, reference: ctx.reference, lineCount: ctx.lines.length }),
    });

    logger.info("Journal posted", {
      module: ctx.module,
      source: ctx.source,
      journalEntryId: entry.id,
      reference: ctx.reference,
    });

    return { id: entry.id, duplicate: false };
  } catch (err) {
    logger.error("Journal post failed", {
      module: ctx.module,
      source: ctx.source,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
