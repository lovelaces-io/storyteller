/**
 * Fail if the agent guidance snippet has drifted between the places it lives.
 *
 * The snippet is the thing most likely to spread — pasted into other projects'
 * AGENTS.md files, written by `storyteller init`, shown on the docs site. Three
 * copies that disagree is worse than one copy that is slightly out of date, so
 * `snippets/agents-section.md` is the single source and everything else must
 * match it exactly.
 */
import { readFileSync } from "node:fs";

const CANONICAL = "snippets/agents-section.md";
const MUST_EMBED = ["README.md"];
const MAX_LINES = 40;

const snippet = readFileSync(CANONICAL, "utf8").trim();

const failures = [];

const lineCount = snippet.split("\n").length;
if (lineCount > MAX_LINES) {
  failures.push(
    `${CANONICAL} is ${lineCount} lines, over the ${MAX_LINES}-line budget.\n` +
      `    A snippet people trim is a snippet that loses its warnings first.`
  );
}

for (const file of MUST_EMBED) {
  const contents = readFileSync(file, "utf8");
  if (!contents.includes(snippet)) {
    failures.push(
      `${file} does not contain ${CANONICAL} verbatim.\n` +
        `    Re-copy it rather than editing the copy in place.`
    );
  }
}

// The snippet teaches the API; it must not teach the deprecated half of it
for (const method of [".note(", ".tell(", ".warn(", ".oops("]) {
  if (snippet.includes(method)) {
    failures.push(`${CANONICAL} uses the deprecated method ${method}`);
  }
}

if (failures.length) {
  console.error(`Snippet check failed:\n\n${failures.join("\n")}\n`);
  process.exit(1);
}

console.log(`Snippet check passed — ${lineCount} lines, in sync across ${MUST_EMBED.length + 1} files.`);
