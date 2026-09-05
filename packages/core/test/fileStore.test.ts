import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Storyteller } from "../src/storyteller";
import { fileStore } from "../src/store/file";
import { memoryStore, storeAudience, type StoredStory } from "../src/store/index";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "storyteller-store-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

function stored(id: string, timestamp: string, extra: Partial<StoredStory> = {}): StoredStory {
  return { timestamp, level: "Information", title: `Story ${id}`, storyId: id, notes: [], ...extra };
}

describe("fileStore", () => {
  it("answers the same queries as the memory store", async () => {
    const path = join(dir, "nested", "stories.jsonl");
    const file = fileStore(path);
    const memory = memoryStore();
    const teller = new Storyteller({ origin: { who: "sync-worker" } });
    teller.audience.remove("console");
    teller.audience.add(storeAudience(file, { name: "file" }));
    teller.audience.add(storeAudience(memory, { name: "memory" }));
    teller.report("Rows loaded", { what: { count: 12 } });
    teller.finish("Sync finished");
    teller.report("Rows skipped", { level: "warn" });
    teller.finish("Sync finished with skips", { level: "warn" });
    await tick();
    await file.flush();

    for (const query of [{}, { about: "skips" }, { minimumLevel: "Warning" as const }, { from: "sync", order: "oldest" as const }]) {
      expect(await file.query(query)).toEqual(await memory.query(query));
    }
    const [first] = await memory.query({ order: "oldest" });
    expect(await file.get(first!.storyId)).toEqual(first);
    expect(await file.get("nope")).toBeUndefined();
    expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(2);
  });

  it("serializes appends and keeps the last write per id", async () => {
    const file = fileStore(join(dir, "s.jsonl"));
    await Promise.all([1, 2, 3, 4, 5].map((n) => file.append(stored(`s${n}`, `2026-09-0${n}T00:00:00.000Z`))));
    await file.append(stored("s3", "2026-09-03T00:00:00.000Z", { title: "rewritten" }));
    expect((await file.query()).map((story) => story.storyId)).toEqual(["s5", "s4", "s3", "s2", "s1"]);
    expect((await file.get("s3"))!.title).toBe("rewritten");
  });

  it("prunes by rewriting the file, and skips a torn line", async () => {
    const path = join(dir, "s.jsonl");
    const file = fileStore(path);
    await file.append(stored("old", "2026-08-01T00:00:00.000Z"));
    await file.append(stored("new", "2026-09-04T00:00:00.000Z"));
    await writeFile(path, `${await readFile(path, "utf8")}{"storyId":"torn","timestamp":"2026-09-0`, "utf8");
    expect((await file.query()).map((story) => story.storyId)).toEqual(["new", "old"]);
    expect(await file.prune(new Date("2026-09-01"))).toBe(1);
    expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(1);
    expect((await file.query()).map((story) => story.storyId)).toEqual(["new"]);
    expect(await file.prune(new Date("2026-09-01"))).toBe(0);
  });

  it("reads an empty store from a file that does not exist yet", async () => {
    const file = fileStore(join(dir, "missing.jsonl"));
    expect(await file.query()).toEqual([]);
    expect(await file.children("x")).toEqual([]);
    expect(await file.prune(new Date())).toBe(0);
  });
});
