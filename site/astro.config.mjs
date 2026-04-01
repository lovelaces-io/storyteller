import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://storyteller.lovelaces.io",
  output: "static",
  integrations: [sitemap()],
});
