/**
 * Every link into this repository's files must point at a file that exists.
 * The monorepo move broke the site's footer once; this keeps it from happening
 * quietly again. Checks GitHub blob/tree links in the site, docs and READMEs,
 * and relative links in the root README, against the working tree.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["site/src", "docs", "README.md", "SECURITY.md", "packages/core/AGENTS.md", "packages/core/llms.txt", "packages/view/README.md", "packages/mcp/README.md"];
const GITHUB = /https:\/\/github\.com\/lovelaces-io\/storyteller\/(?:blob|tree)\/main\/([^\s"')<>#]+)/g;
const RELATIVE = /\]\((?!https?:|mailto:|#|\/)([^)#]+)\)/g;

function* files(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) yield* files(join(path, name));
  } else if (/\.(astro|md|txt|ts|json)$/.test(path)) {
    yield path;
  }
}

const failures = [];
let checked = 0;
for (const root of ROOTS) {
  for (const file of files(root)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(GITHUB)) {
      checked++;
      if (!existsSync(match[1])) failures.push(`${file}: ${match[0]} → no such file: ${match[1]}`);
    }
    if (file === "README.md" || file.startsWith("docs/")) {
      for (const match of text.matchAll(RELATIVE)) {
        const target = match[1].trim();
        if (!target || target.startsWith("`")) continue;
        checked++;
        const base = file === "README.md" ? "." : "docs";
        const resolved = target.startsWith("docs/") || target.startsWith("packages/") || target.startsWith("CHANGELOG") || target.startsWith("SECURITY") ? target : join(base, target);
        if (!existsSync(resolved) && !existsSync(target)) failures.push(`${file}: (${target}) → no such file`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Link check failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`Link check passed — ${checked} links into the repository all resolve.`);
