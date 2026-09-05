import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@lovelaces-io/storyteller/store/file", replacement: fileURLToPath(new URL("../core/src/store/file.ts", import.meta.url)) },
      { find: "@lovelaces-io/storyteller", replacement: fileURLToPath(new URL("../core/src/index.ts", import.meta.url)) },
    ],
  },
  test: { environment: "node" },
});
