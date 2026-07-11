/**
 * Verify operational data persists to PostgreSQL via service layer.
 *   npx electron desktop/scripts/verify-operations-persist.mjs
 */
import { app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadDist(modulePath) {
  return require(path.join(root, "dist-desktop", modulePath));
}

function pass(name, detail) {
  console.log(`[PASS] ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail) {
  console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
  process.exitCode = 1;
}

app.whenReady().then(async () => {
  try {
    const { bootstrapDatabase, disconnectDatabase } = loadDist("services/database");
    const inventory = loadDist("services/operations/inventory.service");
    const { DEV_BYPASS_TOKEN } = loadDist("utils/dev-auth-bypass");
    const { assertTokenPermission } = loadDist("services/permissions.service");

    await bootstrapDatabase();

    const sku = `TEST-${Date.now()}`;
    const created = await inventory.createInventoryItem("default", {
      sku,
      name: "Persist probe",
      category: "Test",
      uom: "ea",
      onHand: 5,
      reorderLevel: 1,
      unitCost: 10,
      warehouse: "Main",
      location: "A1",
      status: "active",
    });
    pass("createInventoryItem", created.id);

    const listed = await inventory.listInventoryItems("default");
    const found = listed.find((i) => i.sku === sku);
    if (found) pass("listInventoryItems round-trip", found.sku);
    else fail("listInventoryItems round-trip", `missing ${sku}`);

    const auth = await assertTokenPermission(DEV_BYPASS_TOKEN, "modify_inventory");
    if (auth.userId) pass("dev bypass token auth", auth.userId);
    else fail("dev bypass token auth", "no userId");

    await inventory.deleteInventoryItem("default", created.id);
    pass("cleanup", created.id);

    await disconnectDatabase();
  } catch (err) {
    fail("unexpected", err instanceof Error ? err.message : String(err));
  } finally {
    app.quit();
  }
});
