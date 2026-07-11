import type { ServerResponse } from "node:http";

import * as hrService from "../services/hr.service";
import {
  assertHrPayrollAccess,
  assertHrPayrollOrUserAdmin,
  assertTokenPermission,
} from "../services/permissions.service";
import type { JsonRequestContext } from "./http-utils";
import { matchRoute, sendError, sendJson } from "./http-utils";

type Handler = (
  ctx: JsonRequestContext,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void>;

async function requireHr(ctx: JsonRequestContext) {
  return assertHrPayrollAccess(ctx.token);
}

async function requireHrOrAdmin(ctx: JsonRequestContext) {
  return assertHrPayrollOrUserAdmin(ctx.token);
}

const routes: { method: string; pattern: string; handler: Handler }[] = [
  {
    method: "GET",
    pattern: "/api/hr/employees",
    handler: async (ctx, res) => {
      await requireHr(ctx);
      sendJson(res, 200, { data: await hrService.listEmployees() });
    },
  },
  {
    method: "GET",
    pattern: "/api/hr/employees/active",
    handler: async (ctx, res) => {
      await requireHrOrAdmin(ctx);
      sendJson(res, 200, { data: await hrService.listActiveEmployees() });
    },
  },
  {
    method: "GET",
    pattern: "/api/hr/timecards",
    handler: async (ctx, res) => {
      await requireHr(ctx);
      sendJson(res, 200, { data: await hrService.listTimecards() });
    },
  },
  {
    method: "GET",
    pattern: "/api/hr/payroll-runs",
    handler: async (ctx, res) => {
      await requireHr(ctx);
      sendJson(res, 200, { data: await hrService.listPayrollRuns() });
    },
  },
  {
    method: "GET",
    pattern: "/api/permissions/users",
    handler: async (ctx, res) => {
      await assertTokenPermission(ctx.token, "manage_users");
      const { listOrgUsers } = await import("../services/user-lifecycle.service");
      sendJson(res, 200, { data: await listOrgUsers() });
    },
  },
  {
    method: "GET",
    pattern: "/api/permissions/roles",
    handler: async (ctx, res) => {
      await assertTokenPermission(ctx.token, "manage_users");
      const { ensureOrgRoles, listOrgRoles } = await import("../services/permissions.service");
      await ensureOrgRoles();
      sendJson(res, 200, { data: await listOrgRoles() });
    },
  },
  {
    method: "POST",
    pattern: "/api/permissions/users/{userId}/reset-password",
    handler: async (ctx, res, params) => {
      const auth = await assertTokenPermission(ctx.token, "manage_users");
      const body = ctx.body as { newPassword?: string };
      const { resetUserAccountPassword } = await import("../services/user-lifecycle.service");
      const data = await resetUserAccountPassword(
        params.userId,
        auth.userId,
        String(body.newPassword ?? ""),
      );
      sendJson(res, 200, { data });
    },
  },
];

export async function handleHrApiRequest(
  ctx: JsonRequestContext,
  res: ServerResponse,
): Promise<boolean> {
  for (const route of routes) {
    if (route.method !== ctx.method) continue;
    const match = matchRoute(ctx.method, ctx.pathname, route.pattern);
    if (!match) continue;
    try {
      await route.handler(ctx, res, match.params);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes("permission") ? 403 : 401;
      sendError(res, status, message);
      return true;
    }
  }
  return false;
}
