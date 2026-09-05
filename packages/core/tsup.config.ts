import { defineConfig } from "tsup";

export default defineConfig([
  {
    // The library and its Node-only store entry point. No code splitting: each
    // entry carries what it needs, so dist has no shared chunk files to explain.
    entry: { index: "src/index.ts", "store/file": "src/store/file.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    splitting: false,
    clean: true,
  },
  {
    // CommonJS only: the CLI reads its snippet relative to __dirname
    entry: ["src/cli.ts"],
    format: ["cjs"],
    dts: false,
    sourcemap: false,
    clean: false,
  },
]);
