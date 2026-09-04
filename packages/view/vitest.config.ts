import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Tests drive the real library to produce fixtures, straight from source so
      // the view is tested against what core emits today, not a stale build.
      "@lovelaces-io/storyteller": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
  },
});
