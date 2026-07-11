import type { ServerResponse } from "node:http";

import * as authService from "../services/auth.service";
import type { JsonRequestContext } from "./http-utils";
import { matchRoute, sendError, sendJson } from "./http-utils";

type Handler = (ctx: JsonRequestContext, res: ServerResponse) => Promise<void>;

const routes: { method: string; pattern: string; handler: Handler }[] = [
  {
    method: "POST",
    pattern: "/api/auth/login",
    handler: async (ctx, res) => {
      const body = ctx.body as { username?: string; password?: string };
      const result = await authService.login(String(body.username ?? ""), String(body.password ?? ""));
      if (!result.ok) {
        sendError(res, 401, result.error);
        return;
      }
      sendJson(res, 200, {
        token: result.data.token,
        session: result.data.session,
      });
    },
  },
  {
    method: "POST",
    pattern: "/api/auth/logout",
    handler: async (ctx, res) => {
      const body = ctx.body as { token?: string };
      await authService.logout(ctx.token ?? body.token ?? null);
      sendJson(res, 200, { ok: true });
    },
  },
  {
    method: "GET",
    pattern: "/api/auth/session",
    handler: async (ctx, res) => {
      if (!ctx.token) {
        sendError(res, 401, "Authentication required.");
        return;
      }
      const result = await authService.getSession(ctx.token);
      if (!result.ok) {
        sendError(res, 401, result.error);
        return;
      }
      if (!result.data) {
        sendError(res, 401, "Session expired or invalid.");
        return;
      }
      sendJson(res, 200, { session: result.data });
    },
  },
  {
    method: "POST",
    pattern: "/api/auth/change-password",
    handler: async (ctx, res) => {
      const body = ctx.body as { newPassword?: string; currentPassword?: string };
      const result = await authService.changePassword(
        ctx.token ?? null,
        String(body.newPassword ?? ""),
        body.currentPassword ? String(body.currentPassword) : undefined,
      );
      if (!result.ok) {
        sendError(res, 400, result.error);
        return;
      }
      sendJson(res, 200, { ok: true });
    },
  },
];

export async function handleAuthApiRequest(
  ctx: JsonRequestContext,
  res: ServerResponse,
): Promise<boolean> {
  for (const route of routes) {
    if (route.method !== ctx.method) continue;
    const match = matchRoute(ctx.method, ctx.pathname, route.pattern);
    if (!match) continue;
    try {
      await route.handler(ctx, res);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 400, message);
      return true;
    }
  }
  return false;
}
