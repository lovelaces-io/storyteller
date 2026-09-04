import type { APIRoute } from "astro";
// The repo-root file, served as-is. One source: the same llms.txt that ships in the
// npm package is the one an agent gets from the site.
import llms from "../../../packages/core/llms.txt?raw";

export const GET: APIRoute = () =>
  new Response(llms, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
