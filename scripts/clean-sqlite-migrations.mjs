import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "prisma", "migrations");
const keep = new Set(["migration_lock.toml", "20260601120000_postgresql_baseline"]);

for (const name of fs.readdirSync(root)) {
  if (keep.has(name)) continue;
  const full = path.join(root, name);
  fs.rmSync(full, { recursive: true, force: true });
  console.log("removed", name);
}

console.log("remaining:", fs.readdirSync(root));
