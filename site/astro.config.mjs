import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://storyteller.lovelaces.io",
  output: "static",
  integrations: [sitemap()],
  vite: {
    // The agents page imports snippets/agents-section.md from the repo root as
    // raw text, so the block shown on the site is the canonical file itself
    server: { fs: { allow: [".."] } },
  },
});
