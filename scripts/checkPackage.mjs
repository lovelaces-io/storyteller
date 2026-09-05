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

/**
 * One entry per published package: the manifest to inspect, which
 * dependency fields it may not have, and what its tarball may contain.
 * The DOM view is as strict as core — it renders text nodes, nothing else.
 */
const PACKAGES = [
  {
    name: "@lovelaces-io/storyteller",
    dir: "packages/core",
    allowedDependencies: [],
    copies: ["README.md", "LICENSE"],
    allowed: /^(dist\/|snippets\/agents-section\.md$|llms\.txt$|AGENTS\.md$|README\.md$|LICENSE$|package\.json$)/,
    required: ["README.md", "LICENSE", "package.json", "dist/cli.cjs", "dist/store/file.js", "dist/store/file.cjs", "dist/store/file.d.ts", "llms.txt", "AGENTS.md"],
  },
  {
    name: "@lovelaces-io/storyteller-view",
    dir: "packages/view",
    allowedDependencies: [],
    copies: ["LICENSE"],
    allowed: /^(dist\/|README\.md$|LICENSE$|package\.json$)/,
    required: ["README.md", "LICENSE", "package.json", "dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/story-view.css"],
  },
  {
    // The Librarian needs the MCP SDK and zod for its schemas, and nothing else.
    // Core is a peer it talks to only through the StoryStore contract.
    name: "@lovelaces-io/storyteller-mcp",
    dir: "packages/mcp",
    allowedDependencies: ["@modelcontextprotocol/sdk", "zod"],
    allowedPeerDependencies: ["@lovelaces-io/storyteller"],
    copies: ["LICENSE"],
    allowed: /^(dist\/|README\.md$|LICENSE$|package\.json$)/,
    required: ["README.md", "LICENSE", "package.json", "dist/index.js", "dist/index.d.ts", "dist/cli.js"],
  },
];

const failures = [];
const summary = [];

for (const pkg of PACKAGES) {
  const manifest = JSON.parse(readFileSync(`${pkg.dir}/package.json`, "utf8"));
  const allowedBy = {
    dependencies: pkg.allowedDependencies ?? [],
    peerDependencies: pkg.allowedPeerDependencies ?? [],
    optionalDependencies: [],
  };
  for (const [field, allowedNames] of Object.entries(allowedBy)) {
    const entries = Object.keys(manifest[field] ?? {}).filter((name) => !allowedNames.includes(name));
    if (entries.length) failures.push(`${pkg.dir}/package.json has ${field} it may not: ${entries.join(", ")}`);
  }
  if (manifest.name !== pkg.name) failures.push(`${pkg.dir} has unexpected package name ${manifest.name}`);
  if (manifest.private) failures.push(`${pkg.name} is marked private`);

  // The build has already run by the time this check does, so pack without
  // scripts — a prepack build would print ahead of the JSON. README and LICENSE
  // are what prepack copies in; copy them the same way so the list is complete.
  for (const name of pkg.copies) copyFileSync(name, `${pkg.dir}/${name}`);
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "-w", pkg.name], { encoding: "utf8" });
  const pack = JSON.parse(output.slice(output.indexOf("[")));
  const files = pack[0].files.map((file) => file.path);
  for (const required of pkg.required) {
    if (!files.includes(required)) failures.push(`${pkg.name} tarball is missing ${required}`);
  }
  for (const file of files) {
    if (!pkg.allowed.test(file)) failures.push(`${pkg.name} tarball contains an unexpected file: ${file}`);
  }
  summary.push(`${pkg.name} ${files.length} files`);
}

if (failures.length) {
  console.error(`Package check failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`Package check passed — only the allowed dependencies, all intended files (${summary.join("; ")}).`);
