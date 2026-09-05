import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    // The bin: a shebang, no types
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: false,
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
