import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";

import { getRendererDistDir } from "../utils/ui-paths";
import { formatLanServiceUrls } from "../utils/lan-network";
import { logger } from "../utils/logger";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8080;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const CRYPTO_POLYFILL = `(function(){var c=typeof globalThis!=="undefined"?globalThis.crypto:typeof crypto!=="undefined"?crypto:null;if(c&&typeof c.randomUUID!=="function"&&typeof c.getRandomValues==="function"){c.randomUUID=function(){var b=new Uint8Array(16);c.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=Array.prototype.map.call(b,function(x){return x.toString(16).padStart(2,"0")}).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20)};}})();`;

let server: http.Server | undefined;

function resolveStaticFile(root: string, urlPath: string): string {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const rel = decoded.replace(/^\/+/, "");
  const candidate = path.join(root, rel);
  const normalizedRoot = path.resolve(root);
  const normalizedFile = path.resolve(candidate);
  if (!normalizedFile.startsWith(normalizedRoot)) {
    return path.join(root, "index.html");
  }
  if (fs.existsSync(normalizedFile) && fs.statSync(normalizedFile).isFile()) {
    return normalizedFile;
  }
  return path.join(root, "index.html");
}

/**
 * Serve packaged renderer-dist over HTTP for LAN tablets/browsers.
 * Remote browsers authenticate via the LAN API (port 3847) and receive permission-gated UI.
 */
export async function startLanUiServer(
  host = process.env.BENBEN_LAN_UI_HOST?.trim() || DEFAULT_HOST,
  port = Number(process.env.BENBEN_LAN_UI_PORT ?? DEFAULT_PORT),
): Promise<string> {
  if (server) {
    const addr = server.address() as AddressInfo;
    return `http://${addr.address}:${addr.port}`;
  }

  const root = getRendererDistDir();
  if (!fs.existsSync(path.join(root, "index.html"))) {
    throw new Error(`LAN UI root missing index.html (${root})`);
  }

  const apiPort = Number(process.env.BENBEN_FINANCE_API_PORT ?? 3847);

  server = http.createServer((req, res) => {
    try {
      const filePath = resolveStaticFile(root, req.url ?? "/");
      const ext = path.extname(filePath).toLowerCase();
      let body = fs.readFileSync(filePath);
      if (ext === ".html") {
        const hostHeader = req.headers.host ?? `localhost:${port}`;
        const apiBase = `http://${hostHeader.split(":")[0]}:${apiPort}`;
        const inject = [
          `<script>`,
          CRYPTO_POLYFILL,
          `window.__BENBEN_LAN_MODE__=true;`,
          `window.__BENBEN_API_BASE__=${JSON.stringify(apiBase)};`,
          `window.__BENBEN_FINANCE_API__=${JSON.stringify(apiBase)};`,
          `(function(){`,
          `if(location.hash)return;`,
          `var p=location.pathname.replace(/^\\/+/, "").replace(/index\\.html$/i, "");`,
          `var q=location.search||"";`,
          `var h=p?"#/"+p+q:"#/"+q;`,
          `history.replaceState(null,"","/"+h);`,
          `})();`,
          `</script>`,
        ].join("");
        let html = body.toString("utf8");
        if (/<base\s/i.test(html)) {
          html = html.replace(/<base[^>]*>/i, '<base href="/" />');
        } else {
          html = html.replace("<head>", '<head>\n    <base href="/" />');
        }
        html = html.replace("</head>", `${inject}</head>`);
        body = Buffer.from(html, "utf8");
      }
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      res.end(body);
    } catch (err) {
      logger.warn("LAN UI request failed", { url: req.url, err });
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server!.listen(port, host, () => resolve());
    server!.on("error", reject);
  });

  const addr = server.address() as AddressInfo;
  const lanUrls = formatLanServiceUrls(addr.port);
  logger.info("LAN UI server listening", {
    bind: `http://${addr.address}:${addr.port}`,
    lanUrls,
    root,
  });
  return `http://${addr.address}:${addr.port}`;
}

export async function stopLanUiServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((err) => (err ? reject(err) : resolve()));
  });
  server = undefined;
}
