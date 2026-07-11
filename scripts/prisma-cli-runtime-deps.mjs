/**
 * Top-level node_modules required by packaged `prisma migrate deploy`
 * (via @prisma/config). Keep in sync with npm's hoisted tree.
 * Used by verify-packaged-prisma.mjs — electron-builder.yml lists the same globs.
 */
export const PRISMA_CLI_RUNTIME_DEPS = [
  "@standard-schema/spec",
  "c12",
  "chokidar",
  "citty",
  "confbox",
  "consola",
  "deepmerge-ts",
  "defu",
  "destr",
  "dotenv",
  "effect",
  "empathic",
  "exsolve",
  "fast-check",
  "giget",
  "jiti",
  "node-fetch-native",
  "nypm",
  "ohash",
  "pathe",
  "perfect-debounce",
  "pkg-types",
  "pure-rand",
  "rc9",
  "readdirp",
  "tinyexec",
];

/** electron-builder file / asarUnpack glob patterns */
export function prismaCliDepGlobs() {
  return PRISMA_CLI_RUNTIME_DEPS.map((name) => {
    if (name.startsWith("@")) {
      const [scope, pkg] = name.split("/");
      return `node_modules/${scope}/${pkg}/**`;
    }
    return `node_modules/${name}/**`;
  });
}
