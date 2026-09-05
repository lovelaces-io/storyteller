import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileStore } from "../src/store/file";
import { memoryStore } from "../src/store/memoryStore";
import { parseDuration, stories } from "../src/store/stories";
import type { StoredStory, StoryQuery } from "../src/store/storyStore";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();

const corpus: StoredStory[] = [
  { storyId: "a", timestamp: at(30), level: "Information", title: "Checkout started", origin: { who: "payment-service" }, durationMs: 120, notes: [{ timestamp: at(30), note: "Cart validated" }] },
  { storyId: "b", timestamp: at(20), level: "Error", title: "Checkout failed", origin: { who: "payment-service", where: { app: "web" } }, durationMs: 6000, notes: [], error: { message: "Card declined" } },
  { storyId: "c", timestamp: at(5), level: "Warning", title: "Nightly sync", origin: { who: "sync-worker" }, durationMs: 90_000, notes: [{ timestamp: at(5), note: "Skipped rows", where: "billing.export" }] },
  { storyId: "d", timestamp: at(1), level: "Information", title: "Digest sent", parentStoryId: "c", notes: [] },
];

/* Returns the store, not a builder: a builder is thenable, so returning one
   from an async function would resolve it into its results. */
async function loadedStore() {
  const store = memoryStore();
  for (const story of corpus) await store.append(story);
  return store;
}
const question = (store: Awaited<ReturnType<typeof loadedStore>>) => stories(store, { now: () => NOW });
const ids = (list: StoredStory[]) => list.map((story) => story.storyId);

describe("parseDuration", () => {
  it("reads the units people write", () => {
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("5m")).toBe(300_000);
    expect(parseDuration("24h")).toBe(86_400_000);
    expect(parseDuration("7d")).toBe(604_800_000);
    expect(parseDuration("2w")).toBe(1_209_600_000);
    expect(parseDuration("1.5h")).toBe(5_400_000);
    expect(parseDuration(" 10 M ")).toBe(600_000);
    expect(parseDuration(250)).toBe(250);
  });

  it("refuses what is not a duration, so a typo cannot mean forever", () => {
    for (const bad of ["yesterday", "24", "h", "-5m", "", "1y"]) expect(() => parseDuration(bad), bad).toThrow(RangeError);
    expect(() => parseDuration(-1)).toThrow(RangeError);
    expect(() => parseDuration(NaN)).toThrow(RangeError);
  });
});

describe("stories()", () => {
  it("compiles each clause to structured criteria, never a string", async () => {
    const recent = question(await loadedStore());
    const query = recent.about("checkout").from("payment-service").level("oops").since("24h").until("1h").slowerThan("5s").oldest().limit(10).skip(2).toQuery();
    expect(query).toEqual<StoryQuery>({
      about: "checkout",
      from: "payment-service",
      level: "Error",
      since: new Date("2026-09-04T12:00:00.000Z"),
      until: new Date("2026-09-05T11:00:00.000Z"),
      slowerThanMs: 5000,
      order: "oldest",
      limit: 10,
      offset: 2,
    });
    expect(recent.failing().toQuery()).toEqual({ failed: true });
    expect(recent.succeeding().toQuery()).toEqual({ failed: false });
    expect(recent.atLeast("warn").toQuery()).toEqual({ minimumLevel: "Warning" });
    expect(recent.level("info").toQuery()).toEqual({ level: "Information" });
    expect(recent.under("c").newest().toQuery()).toEqual({ parentStoryId: "c", order: "newest" });
    expect(recent.since(new Date("2026-01-01")).toQuery()).toEqual({ since: new Date("2026-01-01") });
  });

  it("is immutable: a clause returns a new question and leaves the old one alone", async () => {
    const recent = question(await loadedStore());
    const failing = recent.failing();
    const failingToday = failing.since("24h");
    expect(recent.toQuery()).toEqual({});
    expect(failing.toQuery()).toEqual({ failed: true });
    expect(failingToday.toQuery()).toEqual({ failed: true, since: new Date("2026-09-04T12:00:00.000Z") });
    const query = failingToday.toQuery();
    query.about = "changed";
    expect(failingToday.toQuery().about).toBeUndefined();
  });

  it("reads like the question and answers it", async () => {
    const recent = question(await loadedStore());
    expect(ids(await recent.failing().since("1h"))).toEqual([]);
    expect(ids(await recent.failing().since("24h"))).toEqual(["b"]);
    expect(ids(await recent.about("checkout").from("payment-service").level("oops").since("24h"))).toEqual(["b"]);
    expect(ids(await recent.slowerThan("5s").since("7d").oldest())).toEqual(["b", "c"]);
    expect(ids(await recent.under("c"))).toEqual(["d"]);
    expect(ids(await recent.atLeast("warn").oldest())).toEqual(["b", "c"]);
    expect(ids(await recent.succeeding().since("6h"))).toEqual(["d", "c"]);
    expect(ids(await recent.about("billing"))).toEqual(["c"]);
  });

  it("has terminal forms: all, first, count, and the awaited builder itself", async () => {
    const recent = question(await loadedStore());
    expect(ids(await recent.all())).toEqual(["d", "c", "b", "a"]);
    expect((await recent.since("24h").first())?.storyId).toBe("d");
    expect(await recent.since("24h").oldest().first().then((story) => story?.storyId)).toBe("b");
    expect(await recent.about("nothing").first()).toBeUndefined();
    expect(await recent.count()).toBe(4);
    expect(await recent.limit(1).skip(1).count()).toBe(4);
    expect(ids(await recent.limit(2).skip(1))).toEqual(["c", "b"]);
    const viaThen = await Promise.resolve(recent.level("warn"));
    expect(ids(viaThen)).toEqual(["c"]);
  });

  it("gives identical answers across two adapters", async () => {
    const dir = await mkdtemp(join(tmpdir(), "storyteller-stories-"));
    try {
      const memory = memoryStore();
      const file = fileStore(join(dir, "stories.jsonl"));
      for (const story of corpus) {
        await memory.append(story);
        await file.append(story);
      }
      await file.flush();
      const questions = (recent: ReturnType<typeof stories>) => [
        recent.failing().since("24h"),
        recent.about("checkout").from("payment").oldest(),
        recent.slowerThan("1s").since("7d").limit(1),
        recent.under("c"),
        recent.atLeast("warn").until("2h"),
        recent.succeeding().newest().skip(1),
      ];
      const fromMemory = await Promise.all(questions(stories(memory, { now: () => NOW })));
      const fromFile = await Promise.all(questions(stories(file, { now: () => NOW })));
      expect(fromFile).toEqual(fromMemory);
      expect(fromMemory.map(ids)).toEqual([["b"], ["a", "b"], ["c"], ["d"], ["c", "b"], ["c", "a"]]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
