import http from "node:http";
import type { AddressInfo } from "node:net";
import type { IncomingMessage } from "node:http";

import { logger } from "../utils/logger";
import { handleAuthApiRequest } from "./auth-api";
import { handleFinanceApiRequest } from "./finance-api";
import { handleHrApiRequest } from "./hr-api";
import {
  applyCors,
  extractBearerToken,
  readJsonBody,
  sendError,
  sendJson,
} from "./http-utils";
import { assertTokenPermission } from "../services/permissions.service";

/** Bind all interfaces so LAN clients can reach finance REST endpoints. */
const DEFAULT_BIND_HOST = "0.0.0.0";
/** Loopback URL advertised to the local Electron renderer (0.0.0.0 is not fetchable). */
const DEFAULT_CLIENT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3847;

function requiresModifyGeneralLedger(method: string, pathname: string): boolean {
  if (method !== "POST") return false;
  if (pathname === "/api/finance/gl/entries") return true;
  return /^\/api\/finance\/gl\/entries\/[^/]+\/reverse$/.test(pathname);
}

/** Electron renderer on the same machine calls finance routes over loopback without a bearer token. */
function isLoopbackClient(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? "";
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1" ||
    addr.endsWith("127.0.0.1")
  );
}

let server: http.Server | undefined;

export function isFinanceApiServerRunning(): boolean {
  return Boolean(server?.listening);
}

function resolvePort(): number {
  return Number(process.env.BENBEN_FINANCE_API_PORT ?? DEFAULT_PORT);
}

function resolveBindHost(): string {
  return process.env.BENBEN_FINANCE_API_HOST ?? DEFAULT_BIND_HOST;
}

/** URL for local clients (renderer, main-process health checks). Always loopback-safe. */
export function getFinanceApiClientUrl(): string {
  const port = resolvePort();
  const host = process.env.BENBEN_FINANCE_API_CLIENT_HOST ?? DEFAULT_CLIENT_HOST;
  return `http://${host}:${port}`;
}

/** @deprecated Prefer {@link getFinanceApiClientUrl} — kept for callers expecting this name. */
export function getFinanceApiBaseUrl(): string {
  return getFinanceApiClientUrl();
}

export async function startFinanceApiServer(): Promise<string> {
  if (server) {
    return getFinanceApiClientUrl();
  }

  const bindHost = resolveBindHost();
  const port = resolvePort();
  const clientUrl = getFinanceApiClientUrl();

  server = http.createServer(async (req, res) => {
    if (applyCors(req, res)) return;

    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const token = extractBearerToken(req);

    if (method === "GET" && pathname === "/api/finance/health") {
      sendJson(res, 200, { status: "ok", service: "benben-lan-api" });
      return;
    }

    try {
      const body =
        method === "GET" || method === "DELETE" ? {} : await readJsonBody(req);
      const ctx = { method, pathname, body, token };

      if (await handleAuthApiRequest(ctx, res)) return;
      if (await handleHrApiRequest(ctx, res)) return;

      if (pathname.startsWith("/api/finance/") && !isLoopbackClient(req)) {
        try {
          await assertTokenPermission(token, "view_finance");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendError(res, 401, message);
          return;
        }
      }

      if (!isLoopbackClient(req) && requiresModifyGeneralLedger(method, pathname)) {
        try {
          await assertTokenPermission(token, "modify_general_ledger");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendError(res, 403, message);
          return;
        }
      }

      const handled = await handleFinanceApiRequest(
        { method, pathname: pathname + url.search, body, token },
        res,
      );
      if (!handled) {
        sendError(res, 404, `No route for ${method} ${pathname}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("LAN API error", err);
      sendError(res, 500, message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server?.off("listening", onListening);
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Finance API port ${port} is already in use. Stop the other process or set BENBEN_FINANCE_API_PORT.`,
          ),
        );
        return;
      }
      reject(err);
    };
    const onListening = () => {
      server?.off("error", onError);
      resolve();
    };
    server!.once("error", onError);
    server!.once("listening", onListening);
    server!.listen(port, bindHost);
  });

  const addr = server.address() as AddressInfo;
  logger.info("LAN API listening (auth, finance, HR)", {
    bindHost,
    bindAddress: addr.address,
    port: addr.port,
    clientUrl,
  });
  return clientUrl;
}

export async function stopFinanceApiServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((err) => (err ? reject(err) : resolve()));
  });
  server = undefined;
}
