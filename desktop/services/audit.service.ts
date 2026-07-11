import { getPrisma } from "./database";
import { logger } from "../utils/logger";

export type ActivityInput = {
  orgId?: string;
  userId?: string | null;
  module: string;
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  beforeJson?: string;
  afterJson?: string;
};

/** Structured activity log (ActivityLog table). */
export async function logActivity(input: ActivityInput): Promise<void> {
  const db = getPrisma();
  try {
    await db.activityLog.create({
      data: {
        orgId: input.orgId ?? "default",
        userId: input.userId ?? undefined,
        module: input.module,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        beforeJson: input.beforeJson,
        afterJson: input.afterJson,
      },
    });
  } catch (err) {
    logger.warn("ActivityLog write failed", err);
  }
}

/** Legacy AuditLog table — user-facing audit trail. */
export async function logAuditEvent(input: {
  orgId?: string;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  detail?: string;
}): Promise<void> {
  const db = getPrisma();
  try {
    await db.auditLog.create({
      data: {
        orgId: input.orgId ?? "default",
        userId: input.userId ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        detail: input.detail,
      },
    });
  } catch (err) {
    logger.warn("AuditLog write failed", err);
  }
}

export async function listRecentActivity(limit = 50, orgId = "default") {
  const db = getPrisma();
  return db.activityLog.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export type SystemLogFilters = {
  orgId?: string;
  module?: string;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export type SystemLogRow = {
  logType: "activity" | "audit";
  id: string;
  at: string;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  userId: string | null;
  username: string | null;
};

function inferAuditModule(action: string): string {
  if (action.startsWith("AUTH_") || action.startsWith("USER_")) return "ADMIN";
  if (action.startsWith("PAYROLL_") || action.startsWith("HR_")) return "HR";
  if (action.startsWith("FX_") || action.startsWith("BUDGET_") || action.startsWith("TAX_")) {
    return "FINANCE";
  }
  return "SYSTEM";
}

async function attachUsernames(rows: SystemLogRow[]): Promise<SystemLogRow[]> {
  const db = getPrisma();
  const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
  if (ids.length === 0) return rows.map((r) => ({ ...r, username: null }));

  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, displayName: true },
  });
  const nameById = new Map(
    users.map((u) => [u.id, u.displayName?.trim() || u.username] as const),
  );

  return rows.map((r) => ({
    ...r,
    username: r.userId ? nameById.get(r.userId) ?? null : null,
  }));
}

export async function listSystemLogs(filters: SystemLogFilters = {}): Promise<{
  activity: SystemLogRow[];
  audit: SystemLogRow[];
  combined: SystemLogRow[];
}> {
  const db = getPrisma();
  const orgId = filters.orgId ?? "default";
  const limit = filters.limit ?? 100;
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;

  const activityWhere: Record<string, unknown> = { orgId };
  if (filters.module) {
    const mod = filters.module.toUpperCase();
    activityWhere.OR = [
      { module: filters.module },
      { module: mod },
      { module: filters.module.toLowerCase() },
    ];
  }
  if (filters.entityType) activityWhere.entityType = filters.entityType;
  if (filters.action) activityWhere.action = filters.action;
  if (from || to) {
    activityWhere.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const auditWhere: Record<string, unknown> = { orgId };
  if (filters.entityType) auditWhere.entityType = filters.entityType;
  if (filters.action) auditWhere.action = filters.action;
  if (from || to) {
    auditWhere.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const [activityRows, auditRows] = await Promise.all([
    db.activityLog.findMany({
      where: activityWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.auditLog.findMany({
      where: auditWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const activity: SystemLogRow[] = activityRows.map((r) => ({
    logType: "activity" as const,
    id: r.id,
    at: r.createdAt.toISOString(),
    module: r.module.toUpperCase(),
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    userId: r.userId,
    username: null,
  }));

  const audit: SystemLogRow[] = auditRows
    .filter((r) => {
      if (!filters.module) return true;
      const mod = inferAuditModule(r.action);
      const filter = filters.module.toUpperCase();
      return mod === filter || mod === filters.module || r.action.toLowerCase().includes(filter.toLowerCase());
    })
    .map((r) => ({
      logType: "audit" as const,
      id: r.id,
      at: r.createdAt.toISOString(),
      module: inferAuditModule(r.action),
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.detail ?? null,
      userId: r.userId,
      username: null,
    }));

  const combinedRaw = [...activity, ...audit]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);

  const combined = await attachUsernames(combinedRaw);

  return { activity, audit, combined };
}
