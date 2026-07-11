import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/** Repository root during local development. */
export function getDevProjectRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

/**
 * Production root: native Prisma engines and CLI must live outside app.asar.
 * electron-builder places asarUnpack content under resources/app.asar.unpacked.
 */
export function getPackagedAppRoot(): string {
  const unpacked = path.join(process.resourcesPath, "app.asar.unpacked");
  if (fs.existsSync(unpacked)) {
    return unpacked;
  }
  const resourcesApp = path.join(process.resourcesPath, "app");
  if (fs.existsSync(resourcesApp)) {
    return resourcesApp;
  }
  const appPath = app.getAppPath();
  if (appPath.endsWith(".asar")) {
    return path.join(process.resourcesPath, "app.asar.unpacked");
  }
  return appPath;
}

export function getPrismaRuntimeRoot(): string {
  return app.isPackaged ? getPackagedAppRoot() : getDevProjectRoot();
}

export function getPrismaCliPath(): string {
  return path.join(getPrismaRuntimeRoot(), "node_modules", "prisma", "build", "index.js");
}

export function getPrismaSchemaPath(): string {
  return path.join(getPrismaRuntimeRoot(), "prisma", "schema.prisma");
}

/** Resolve packaged Prisma query engine (.node) from known electron-builder locations. */
export function resolvePackagedQueryEngine(): string | undefined {
  const root = getPrismaRuntimeRoot();
  const candidates = [
    path.join(root, "node_modules", ".prisma", "client"),
    path.join(root, "node_modules", "@prisma", "engines"),
    path.join(root, "node_modules", "prisma"),
  ];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const engine = fs
      .readdirSync(dir)
      .find((name) => name.includes("query_engine") && name.endsWith(".node"));
    if (engine) return path.join(dir, engine);
  }
  return undefined;
}

function resolvePackagedSchemaEngine(): string | undefined {
  const enginesDir = path.join(getPrismaRuntimeRoot(), "node_modules", "@prisma", "engines");
  if (!fs.existsSync(enginesDir)) return undefined;
  const engine = fs
    .readdirSync(enginesDir)
    .find((name) => name.startsWith("schema-engine") && !name.endsWith(".md"));
  return engine ? path.join(enginesDir, engine) : undefined;
}

/** Configure Prisma Client + migration engine paths for the unpacked bundle. */
export function configurePackagedQueryEngine(): void {
  if (!app.isPackaged) return;

  const queryEngine = resolvePackagedQueryEngine();
  if (queryEngine) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = queryEngine;
  }

  const schemaEngine = resolvePackagedSchemaEngine();
  if (schemaEngine) {
    process.env.PRISMA_SCHEMA_ENGINE_BINARY = schemaEngine;
  }
}

/** Absolute path to the packaged schema-engine binary (for Prisma CLI child env). */
export function getPrismaSchemaEnginePath(): string | undefined {
  configurePackagedQueryEngine();
  const fromEnv = process.env.PRISMA_SCHEMA_ENGINE_BINARY?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return resolvePackagedSchemaEngine();
}

export function assertPrismaPackagedAssets(): void {
  const generatedClient = path.join(
    getPrismaRuntimeRoot(),
    "node_modules",
    ".prisma",
    "client",
    "default.js",
  );
  if (!fs.existsSync(generatedClient)) {
    throw new Error(`Generated Prisma client not found at ${generatedClient}`);
  }
  const cli = getPrismaCliPath();
  if (!fs.existsSync(cli)) {
    throw new Error(`Prisma CLI not found at ${cli}`);
  }
  const schema = getPrismaSchemaPath();
  if (!fs.existsSync(schema)) {
    throw new Error(`Prisma schema not found at ${schema}`);
  }
  const migrations = path.join(getPrismaRuntimeRoot(), "prisma", "migrations");
  if (!fs.existsSync(migrations)) {
    throw new Error(`Prisma migrations not found at ${migrations}`);
  }

  if (app.isPackaged) {
    const effectPkg = path.join(getPrismaRuntimeRoot(), "node_modules", "effect", "package.json");
    if (!fs.existsSync(effectPkg)) {
      throw new Error(
        `Prisma CLI dependency "effect" not packaged at ${effectPkg}. Rebuild with updated electron-builder.yml.`,
      );
    }
  }
}
