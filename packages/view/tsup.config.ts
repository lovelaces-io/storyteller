import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // The stylesheet ships next to the code: import "@lovelaces-io/storyteller-view/style.css"
  publicDir: "src/styles",
});
