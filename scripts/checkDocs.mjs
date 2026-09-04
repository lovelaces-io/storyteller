/**
 * Fail if documentation code samples use a deprecated method.
 *
 * Only fenced TypeScript blocks are scanned — prose and migration tables are
 * supposed to name the old verbs, and flagging those would make the check useless.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "README.md",
  "AGENTS.md",
  "packages/core/AGENTS.md",
  "packages/core/llms.txt",
  "docs/API.md",
  "docs/HOW-IT-WORKS.md",
];

/**
 * Site pages keep their code in highlighted template strings rather than fenced
 * blocks, so they are scanned whole. Calls appear either bare or wrapped in a
 * syntax-highlighting span: `story.tell(` or `<span class="function">tell</span>(`.
 */
/** Every page, layout, component and sample module under the site source tree */
function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (/\.(astro|ts)$/.test(entry)) found.push(path);
  }
  return found;
}
const SITE_FILES = walk("site/src");
const SITE_DEPRECATED = /(?:\.|>)(note|tell|warn|oops)(?:<\/span>)?\(/g;

const DEPRECATED = [
  { pattern: /\.note\(/, replacement: "report()" },
  { pattern: /\.tell\(/, replacement: "finish()" },
  { pattern: /\.warn\(/, replacement: 'finish(title, { level: "warn" })' },
  { pattern: /\.oops\(/, replacement: 'finish(title, { level: "oops", error })' },
];

/**
 * Opt a section out when it exists to document a deprecated method on purpose.
 * Applies from the marker to the next heading, since one section usually holds
 * both a signature block and an example.
 */
const ALLOW_MARKER = "<!-- docs-check: allow-deprecated -->";

/** Pull the contents of fenced ts/typescript blocks, with their line numbers */
function readCodeSamples(text) {
  const lines = text.split("\n");
  const samples = [];
  let insideBlock = false;
  let allowed = false;

  lines.forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) {
      allowed = true;
      return;
    }
    if (!insideBlock && /^#{2,}\s/.test(line)) {
      allowed = false;
    }
    if (/^```(ts|typescript)\s*$/.test(line)) {
      insideBlock = true;
      return;
    }
    if (insideBlock && /^```/.test(line)) {
      insideBlock = false;
      return;
    }
    if (insideBlock && !allowed) samples.push({ line, number: index + 1 });
  });

  return samples;
}

const failures = [];

for (const file of FILES) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const { line, number } of readCodeSamples(text)) {
    // console.warn is not our warn()
    if (/console\.(warn|error|log)/.test(line)) continue;

    for (const { pattern, replacement } of DEPRECATED) {
      if (pattern.test(line)) {
        failures.push(`${file}:${number} uses a deprecated method — use ${replacement}\n    ${line.trim()}`);
      }
    }
  }
}

for (const file of SITE_FILES) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  // Same opt-out as the markdown files: the marker suppresses checking until
  // the next heading or section, so a migration note can name the old verbs
  let allowed = false;
  text.split("\n").forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) {
      allowed = true;
      return;
    }
    if (/<(h2|h3|section)\b/.test(line)) allowed = false;
    if (allowed) return;
    if (/console\.(warn|error|log)/.test(line)) return;
    for (const match of line.matchAll(SITE_DEPRECATED)) {
      failures.push(`${file}:${index + 1} uses deprecated ${match[1]}()\n    ${line.trim().slice(0, 100)}`);
    }
  });
}

if (failures.length) {
  console.error(`Documentation uses deprecated methods:\n\n${failures.join("\n")}\n`);
  process.exit(1);
}

console.log(`Docs check passed — no deprecated methods in ${FILES.length + SITE_FILES.length} files.`);
