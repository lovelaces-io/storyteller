/**
 * Fail if the published package ever stops being what it promises.
 *
 * Two things this repo guarantees and a monorepo makes easy to break by
 * accident: @lovelaces-io/storyteller has zero runtime dependencies, and its
 * tarball contains exactly the intended files. Adapters with real dependencies
 * live next door; nothing from them may leak into core.
 */
import { copyFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(readFileSync("packages/core/package.json", "utf8"));
const failures = [];

for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  const entries = Object.keys(manifest[field] ?? {});
  if (entries.length) failures.push(`packages/core/package.json has ${field}: ${entries.join(", ")}`);
}
if (manifest.name !== "@lovelaces-io/storyteller") failures.push(`unexpected package name ${manifest.name}`);
if (manifest.private) failures.push("core is marked private");

const allowed = /^(dist\/|snippets\/agents-section\.md$|llms\.txt$|AGENTS\.md$|README\.md$|LICENSE$|package\.json$)/;

// The build has already run by the time this check does, so pack without
// scripts — a prepack build would print ahead of the JSON. README and LICENSE
// are what prepack copies in; copy them the same way so the list is complete.
for (const name of ["README.md", "LICENSE"]) copyFileSync(name, `packages/core/${name}`);
const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "-w", "@lovelaces-io/storyteller"], { encoding: "utf8" });
const pack = JSON.parse(output.slice(output.indexOf("[")));
const files = pack[0].files.map((file) => file.path);
for (const required of ["README.md", "LICENSE", "package.json"]) {
  if (!files.includes(required)) failures.push(`tarball is missing ${required}`);
}
for (const file of files) {
  if (!allowed.test(file)) failures.push(`tarball contains an unexpected file: ${file}`);
}
if (!files.includes("dist/cli.cjs")) failures.push("tarball is missing dist/cli.cjs (the bin)");
if (!files.includes("llms.txt") || !files.includes("AGENTS.md")) failures.push("tarball is missing the machine-readable files");

if (failures.length) {
  console.error(`Package check failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`Package check passed — zero dependencies, ${files.length} files, all intended.`);
