import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackageManager, initializeProject, readSnippet } from "../src/cli";

let projectRoot: string;

/** A throwaway project directory with a minimal package.json */
function createProject(manifest: Record<string, unknown> = { name: "demo-app" }) {
  const root = mkdtempSync(join(tmpdir(), "storyteller-init-"));
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest, null, 2));
  return root;
}

/** Run init without touching the network */
function init(root: string) {
  return initializeProject(root, { install: false });
}

beforeEach(() => {
  projectRoot = createProject();
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("storyteller init", () => {
  it("takes a bare project to a working setup in one run", () => {
    const result = init(projectRoot);

    expect(existsSync(join(projectRoot, "storyteller.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, "AGENTS.md"))).toBe(true);
    expect(result.changed.length).toBeGreaterThan(0);
  });

  it("writes a starter that names the project as its origin", () => {
    const starter = readFileSync(join(projectRoot, "package.json"), "utf8");
    expect(starter).toContain("demo-app");

    init(projectRoot);

    const written = readFileSync(join(projectRoot, "storyteller.ts"), "utf8");
    expect(written).toContain('who: "demo-app"');
    expect(written).toContain("@lovelaces-io/storyteller");
  });

  it("strips the scope from a scoped package name", () => {
    const scoped = createProject({ name: "@acme/billing" });
    try {
      initializeProject(scoped, { install: false });
      const written = readFileSync(join(scoped, "storyteller.ts"), "utf8");
      expect(written).toContain('who: "billing"');
    } finally {
      rmSync(scoped, { recursive: true, force: true });
    }
  });

  it("writes into src/ when the project has one", () => {
    mkdirSync(join(projectRoot, "src"));
    init(projectRoot);

    expect(existsSync(join(projectRoot, "src", "storyteller.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, "storyteller.ts"))).toBe(false);
  });

  it("refuses to run outside a Node project", () => {
    const empty = mkdtempSync(join(tmpdir(), "storyteller-empty-"));
    try {
      expect(() => initializeProject(empty, { install: false })).toThrow(/package\.json/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("running init twice", () => {
  it("changes nothing the second time", () => {
    init(projectRoot);
    const afterFirst = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");

    const second = init(projectRoot);
    const afterSecond = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");

    expect(afterSecond).toBe(afterFirst);
    expect(second.changed).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
  });

  it("does not duplicate the guidance block", () => {
    init(projectRoot);
    init(projectRoot);
    init(projectRoot);

    const contents = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");
    const occurrences = contents.split("<!-- storyteller:begin -->").length - 1;
    expect(occurrences).toBe(1);
  });

  it("never overwrites an edited starter", () => {
    init(projectRoot);
    const starterPath = join(projectRoot, "storyteller.ts");
    writeFileSync(starterPath, "// my own version\n");

    init(projectRoot);

    expect(readFileSync(starterPath, "utf8")).toBe("// my own version\n");
  });
});

describe("existing guidance files", () => {
  it("appends to an existing AGENTS.md without losing its content", () => {
    writeFileSync(
      join(projectRoot, "AGENTS.md"),
      "# My Guide\n\nSomething important I wrote.\n"
    );

    init(projectRoot);

    const contents = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");
    expect(contents).toContain("Something important I wrote.");
    expect(contents).toContain("<!-- storyteller:begin -->");
  });

  it("uses CLAUDE.md when that is the file the project has", () => {
    writeFileSync(join(projectRoot, "CLAUDE.md"), "# Claude Guide\n");

    init(projectRoot);

    expect(readFileSync(join(projectRoot, "CLAUDE.md"), "utf8")).toContain(
      "<!-- storyteller:begin -->"
    );
    expect(existsSync(join(projectRoot, "AGENTS.md"))).toBe(false);
  });

  it("refreshes a stale block in place rather than adding another", () => {
    writeFileSync(
      join(projectRoot, "AGENTS.md"),
      "# Guide\n\nBefore.\n\n<!-- storyteller:begin -->\nold guidance\n<!-- storyteller:end -->\n\nAfter.\n"
    );

    const result = init(projectRoot);
    const contents = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");

    expect(contents).toContain("Before.");
    expect(contents).toContain("After.");
    expect(contents).not.toContain("old guidance");
    expect(contents.split("<!-- storyteller:begin -->").length - 1).toBe(1);
    expect(result.changed.some((entry) => entry.includes("refreshed"))).toBe(true);
  });

  it("leaves an unterminated block for a human rather than guessing", () => {
    const damaged = "# Guide\n\n<!-- storyteller:begin -->\nhalf written\n";
    writeFileSync(join(projectRoot, "AGENTS.md"), damaged);

    const result = init(projectRoot);

    expect(readFileSync(join(projectRoot, "AGENTS.md"), "utf8")).toBe(damaged);
    expect(result.notes.some((note) => note.includes("unterminated"))).toBe(true);
  });
});

describe("package manager detection", () => {
  it("defaults to npm", () => {
    expect(detectPackageManager(projectRoot).name).toBe("npm");
  });

  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ])("detects %s as %s", (lockfile, expected) => {
    writeFileSync(join(projectRoot, lockfile), "");
    expect(detectPackageManager(projectRoot).name).toBe(expected);
  });
});

describe("the guidance snippet", () => {
  it("is found on disk", () => {
    expect(readSnippet().length).toBeGreaterThan(0);
  });

  it("teaches the current API, not the deprecated one", () => {
    const snippet = readSnippet();

    expect(snippet).toContain("report(");
    expect(snippet).toContain("finish(");
    expect(snippet).not.toContain(".tell(");
    expect(snippet).not.toContain(".oops(");
  });

  it("stays inside the line budget", () => {
    expect(readSnippet().trim().split("\n").length).toBeLessThanOrEqual(40);
  });
});
