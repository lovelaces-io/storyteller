import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The root import must run in a browser. Anything that needs Node ships from
 * its own entry point (store/file, the CLI). This walks every import reachable
 * from src/index.ts and fails on a Node builtin.
 */
const NODE_BUILTINS = new Set(["fs", "path", "os", "child_process", "crypto", "stream", "util", "url", "http", "https", "net", "worker_threads", "zlib", "readline", "events", "buffer"]);

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) specifiers.push(match[1]!);
  return specifiers;
}

function reachable(entry: string): { files: Set<string>; external: Set<string> } {
  const files = new Set<string>();
  const external = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of importsOf(file)) {
      if (!specifier.startsWith(".")) { external.add(specifier); continue; }
      const target = resolve(dirname(file), specifier);
      stack.push(target.endsWith(".ts") ? target : `${target}.ts`);
    }
  }
  return { files, external };
}

describe("the root entry point", () => {
  const root = resolve(__dirname, "../src/index.ts");
  const { files, external } = reachable(root);

  it("imports no Node builtin", () => {
    const offenders = [...external].filter((specifier) => specifier.startsWith("node:") || NODE_BUILTINS.has(specifier));
    expect(offenders).toEqual([]);
  });

  it("does not reach the file store or the CLI", () => {
    const names = [...files].map((file) => file.slice(resolve(__dirname, "../src").length + 1));
    expect(names).not.toContain("store/fileStore.ts");
    expect(names).not.toContain("store/file.ts");
    expect(names).not.toContain("cli.ts");
    expect(names).toContain("store/memoryStore.ts");
  });

  it("while the file entry point does, on purpose", () => {
    const { external: fileExternal } = reachable(resolve(__dirname, "../src/store/file.ts"));
    expect([...fileExternal].some((specifier) => specifier.startsWith("node:"))).toBe(true);
  });
});
