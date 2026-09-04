import type { APIRoute } from "astro";
// The three machine-readable files that ship in the package, concatenated:
// the summary, the full agent guide, and the block agents paste into AGENTS.md.
import llms from "../../../packages/core/llms.txt?raw";
import agents from "../../../packages/core/AGENTS.md?raw";
import snippet from "../../../packages/core/snippets/agents-section.md?raw";

const body = [llms, "\n\n---\n\n# Full agent guide (AGENTS.md)\n\n", agents, "\n\n---\n\n# Guidance block for your AGENTS.md\n\n", snippet].join("");

export const GET: APIRoute = () =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
