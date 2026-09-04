#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Wraps the guidance block so it can be recognized and refreshed rather than duplicated */
const SECTION_START = "<!-- storyteller:begin -->";
const SECTION_END = "<!-- storyteller:end -->";

const PACKAGE_NAME = "@lovelaces-io/storyteller";

/** Files an agent reads for project guidance, in the order we prefer to write to */
const GUIDANCE_FILES = ["AGENTS.md", "CLAUDE.md"];

type PackageManager = {
  name: string;
  lockfile: string;
  install: string[];
};

/** Lockfile to package manager, most specific first */
const PACKAGE_MANAGERS: PackageManager[] = [
  { name: "pnpm", lockfile: "pnpm-lock.yaml", install: ["add"] },
  { name: "yarn", lockfile: "yarn.lock", install: ["add"] },
  { name: "bun", lockfile: "bun.lockb", install: ["add"] },
  { name: "npm", lockfile: "package-lock.json", install: ["install"] },
];

type InitResult = {
  changed: string[];
  skipped: string[];
  notes: string[];
};

/**
 * Set a project up to use Storyteller: install it, write a configured instance,
 * and teach the project's agents how to narrate their work.
 *
 * Safe to run twice — existing files are appended to or left alone, never rewritten.
 *
 * @param projectRoot - Directory to set up
 * @param options - `install: false` to skip the dependency install
 * @returns What changed, what was already in place, and anything worth saying
 */
export function initializeProject(
  projectRoot: string,
  options: { install?: boolean } = {}
): InitResult {
  const result: InitResult = { changed: [], skipped: [], notes: [] };

  const packageJsonPath = join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      "No package.json here. Run this from the root of a Node project."
    );
  }

  if (options.install !== false) {
    installDependency(projectRoot, packageJsonPath, result);
  }

  writeStarterModule(projectRoot, packageJsonPath, result);
  writeGuidanceSection(projectRoot, result);

  return result;
}

/** Add the package unless it is already a dependency */
function installDependency(
  projectRoot: string,
  packageJsonPath: string,
  result: InitResult
) {
  const manifest = readJson(packageJsonPath);
  const dependencies = {
    ...(manifest["dependencies"] as Record<string, string> | undefined),
    ...(manifest["devDependencies"] as Record<string, string> | undefined),
  };

  if (dependencies[PACKAGE_NAME]) {
    result.skipped.push(`${PACKAGE_NAME} (already a dependency)`);
    return;
  }

  const manager = detectPackageManager(projectRoot);
  try {
    execFileSync(manager.name, [...manager.install, PACKAGE_NAME], {
      cwd: projectRoot,
      stdio: "inherit",
    });
    result.changed.push(`installed ${PACKAGE_NAME} with ${manager.name}`);
  } catch {
    // An install can fail for a dozen reasons that are not our business —
    // offline, a private registry, no auth. Say what to run and carry on.
    result.notes.push(
      `Could not install automatically. Run: ${manager.name} ${manager.install.join(" ")} ${PACKAGE_NAME}`
    );
  }
}

/** Choose a package manager from the lockfile present, defaulting to npm */
export function detectPackageManager(projectRoot: string): PackageManager {
  for (const manager of PACKAGE_MANAGERS) {
    if (existsSync(join(projectRoot, manager.lockfile))) return manager;
  }
  return PACKAGE_MANAGERS[PACKAGE_MANAGERS.length - 1]!;
}

/** Write a configured storyteller the project can import, if there is not one already */
function writeStarterModule(
  projectRoot: string,
  packageJsonPath: string,
  result: InitResult
) {
  const sourceDirectory = existsSync(join(projectRoot, "src")) ? "src" : ".";
  const starterPath = join(projectRoot, sourceDirectory, "storyteller.ts");

  if (existsSync(starterPath)) {
    result.skipped.push(`${sourceDirectory}/storyteller.ts (already exists)`);
    return;
  }

  const manifest = readJson(packageJsonPath);
  const projectName =
    typeof manifest["name"] === "string" && manifest["name"].length
      ? manifest["name"].replace(/^@[^/]+\//, "")
      : "app";

  writeFileSync(
    starterPath,
    `import { Storyteller } from "${PACKAGE_NAME}";

/**
 * The storyteller for this project. Import it wherever work happens.
 *
 * Set STORYTELLER_NARRATION=live to watch beats stream as they happen.
 */
export const story = new Storyteller({
  origin: { who: ${JSON.stringify(projectName)} },
});
`,
    "utf8"
  );
  result.changed.push(`${sourceDirectory}/storyteller.ts`);
}

/** Add the guidance block to the project's agent instructions, or refresh it in place */
function writeGuidanceSection(projectRoot: string, result: InitResult) {
  const snippet = readSnippet();
  const block = `${SECTION_START}\n${snippet.trim()}\n${SECTION_END}\n`;

  const existing = GUIDANCE_FILES.map((name) => join(projectRoot, name)).find(
    (path) => existsSync(path)
  );
  const targetPath = existing ?? join(projectRoot, GUIDANCE_FILES[0]!);
  const relativeName = targetPath.slice(projectRoot.length + 1);

  if (!existing) {
    writeFileSync(targetPath, `# Agent Guide\n\n${block}`, "utf8");
    result.changed.push(`${relativeName} (created)`);
    return;
  }

  const current = readFileSync(targetPath, "utf8");
  const startIndex = current.indexOf(SECTION_START);

  if (startIndex === -1) {
    writeFileSync(targetPath, `${current.trimEnd()}\n\n${block}`, "utf8");
    result.changed.push(relativeName);
    return;
  }

  const endIndex = current.indexOf(SECTION_END, startIndex);
  if (endIndex === -1) {
    // A half-written block from an interrupted run — leave it for a human
    result.notes.push(
      `${relativeName} has an unterminated ${SECTION_START} block. Fix or remove it, then re-run.`
    );
    return;
  }

  const before = current.slice(0, startIndex);
  const after = current.slice(endIndex + SECTION_END.length);
  const updated = `${before}${block.trimEnd()}${after}`;

  if (updated === current) {
    result.skipped.push(`${relativeName} (already up to date)`);
    return;
  }

  writeFileSync(targetPath, updated, "utf8");
  result.changed.push(`${relativeName} (guidance refreshed)`);
}

/** Read the canonical guidance snippet that ships with the package */
export function readSnippet(): string {
  const candidates = [
    join(__dirname, "..", "snippets", "agents-section.md"),
    join(__dirname, "..", "..", "snippets", "agents-section.md"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }

  throw new Error("Could not find the guidance snippet that ships with this package.");
}

/** Parse a JSON file, with a message that names the file when it is malformed */
function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Could not read ${path}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/** Entry point for `npx storyteller init` */
function main(argv: string[]) {
  const command = argv[0] ?? "init";

  if (command === "--help" || command === "-h" || command === "help") {
    console.log(
      [
        "storyteller init [--no-install]",
        "",
        "  Sets this project up to use Storyteller:",
        "    - installs the package",
        "    - writes a configured storyteller",
        "    - teaches your agents to narrate their work",
        "",
        "  Safe to run more than once.",
      ].join("\n")
    );
    return;
  }

  if (command !== "init") {
    console.error(`Unknown command: ${command}\nTry: storyteller init`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = initializeProject(process.cwd(), {
      install: !argv.includes("--no-install"),
    });

    for (const change of result.changed) console.log(`  added    ${change}`);
    for (const skip of result.skipped) console.log(`  kept     ${skip}`);
    for (const note of result.notes) console.log(`  note     ${note}`);

    console.log("\nTry it:");
    console.log("  STORYTELLER_NARRATION=live node your-script.js");
  } catch (error) {
    console.error(`storyteller init failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

// Only run when invoked as a command, so the functions above stay testable
if (require.main === module) {
  main(process.argv.slice(2));
}
