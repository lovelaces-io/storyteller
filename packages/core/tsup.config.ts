import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
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
