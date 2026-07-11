import type { IpcMainInvokeEvent } from "electron";

import { extractToken } from "./permission-guard";
import { getPrisma } from "../services/database";
import { logActivity, type ActivityInput } from "../services/audit.service";

export type IpcActor = { userId: string; name: string };

export async function resolveActorUserId(token: string | null | undefined): Promise<string | null> {
  const actor = await resolveActor(token);
  return actor?.userId ?? null;
}

export async function resolveActor(token: string | null | undefined): Promise<IpcActor | null> {
  if (!token) return null;
  const db = getPrisma();
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || row.expiresAt < new Date() || !row.user.isActive) return null;
  return { userId: row.user.id, name: row.user.displayName ?? row.user.username };
}

export async function logIpcActivity(
  event: IpcMainInvokeEvent,
  payload: unknown,
  input: Omit<ActivityInput, "userId">,
): Promise<void> {
  const userId = await resolveActorUserId(extractToken(payload));
  await logActivity({ ...input, userId });
}
