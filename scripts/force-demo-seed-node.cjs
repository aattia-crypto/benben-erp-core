/**
 * Force-seed Presenter Mode data without Electron GUI.
 * Requires Demo Postgres already listening on the runtime port.
 */
const Module = require("module");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outLog = path.join(__dirname, "force-demo-seed.out.log");

function log() {
  const args = Array.prototype.slice.call(arguments);
  const line = args
    .map(function (a) {
      return typeof a === "string" ? a : JSON.stringify(a, null, 2);
    })
    .join(" ");
  fs.appendFileSync(outLog, line + "\n", "utf8");
  console.log(line);
}

fs.writeFileSync(outLog, "", "utf8");
log("[force-seed-node] boot", new Date().toISOString());

process.env.BENBEN_BUILD_FLAVOR = "demo";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "electron") {
    return {
      app: {
        isPackaged: false,
        getPath: function (name) {
          if (name === "userData") {
            return path.join(process.env.APPDATA || "", "Benben ERP Demo");
          }
          return process.cwd();
        },
        getAppPath: function () {
          return root;
        },
        whenReady: function () {
          return Promise.resolve();
        },
        disableHardwareAcceleration: function () {},
        exit: function (code) {
          process.exit(code || 0);
        },
        on: function () {
          return this;
        },
      },
    };
  }
  return originalRequire.apply(this, arguments);
};

const cfgPath = path.join(process.env.APPDATA || "", "Benben ERP Demo", "postgres-runtime.json");
if (!fs.existsSync(cfgPath)) {
  throw new Error("Missing " + cfgPath);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
process.env.DATABASE_URL =
  "postgresql://" +
  encodeURIComponent(cfg.user) +
  ":" +
  encodeURIComponent(cfg.password) +
  "@127.0.0.1:" +
  cfg.port +
  "/" +
  cfg.database +
  "?schema=public";

log(
  "[force-seed-node] DATABASE_URL -> postgresql://" +
    cfg.user +
    ":***@127.0.0.1:" +
    cfg.port +
    "/" +
    cfg.database
);

async function main() {
  log("[force-seed-node] prisma db push ...");
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  const database = require(path.join(root, "dist-desktop", "services", "database.js"));
  const seed = require(path.join(root, "dist-desktop", "services", "demo-operational-seed.service.js"));

  log("[force-seed-node] connecting Prisma ...");
  await database.connectDatabase();

  log("[force-seed-node] running seedDemoOperationalData (wipe + hydrate) ...");
  const ok = await seed.seedDemoOperationalData("default");
  if (!ok) {
    throw new Error("seedDemoOperationalData returned false — demo gate failed");
  }

  const db = database.getPrisma();
  const report = {
    parties: await db.crmParty.count({ where: { orgId: "default" } }),
    warehouses: await db.stockLocation.count({ where: { orgId: "default", kind: "warehouse" } }),
    stores: await db.stockLocation.count({ where: { orgId: "default", kind: "store" } }),
    skus: await db.inventoryItem.count({ where: { orgId: "default" } }),
    batches: await db.productionBatch.count({ where: { orgId: "default" } }),
    employees: await db.employee.count(),
    boms: await db.bom.count({ where: { orgId: "default" } }),
    purchaseOrders: await db.purchaseOrder.count({ where: { orgId: "default" } }),
    sampleParties: await db.crmParty.findMany({
      where: { orgId: "default" },
      select: { code: true, name: true, kind: true },
      orderBy: { code: "asc" },
      take: 12,
    }),
    sampleWarehouses: await db.stockLocation.findMany({
      where: { orgId: "default", kind: "warehouse" },
      select: { id: true, label: true },
      orderBy: { id: "asc" },
    }),
  };

  log("[force-seed-node] CONFIRMATION — rows written:");
  log(report);

  const failed = [];
  if (report.parties < 10) failed.push("parties=" + report.parties);
  if (report.warehouses < 6) failed.push("warehouses=" + report.warehouses);
  if (report.skus < 12) failed.push("skus=" + report.skus);
  if (failed.length) {
    throw new Error("Seed incomplete: " + failed.join(", "));
  }

  log("[force-seed-node] SUCCESS — CRM, locations, and inventory are hydrated.");
  await database.getPrisma().$disconnect();
}

main().catch(async function (err) {
  log("[force-seed-node] FAILED:", err && err.stack ? err.stack : String(err));
  console.error(err);
  process.exitCode = 1;
  try {
    const database = require(path.join(root, "dist-desktop", "services", "database.js"));
    await database.getPrisma().$disconnect();
  } catch (e) {}
});
