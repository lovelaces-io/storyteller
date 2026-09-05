import { describe, expect, it } from "vitest";
import type { StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";
import { memoryStore } from "../src/store/memoryStore";
import { storeAudience } from "../src/store/storeAudience";
import { applyQuery, canonicalRow, matchesQuery, storySearchText, toStoredStory, type StoredStory } from "../src/store/storyStore";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A storyteller whose stories land in a store and are also captured raw */
function tellerInto(store: ReturnType<typeof memoryStore>) {
  const raw: StoryEvent[] = [];
  const teller = new Storyteller({ origin: { who: "checkout-service", where: { region: "us-east-1" } } });
  teller.audience.remove("console");
  teller.audience.add({ name: "raw", hear: (event) => { raw.push(event); } });
  teller.audience.add(storeAudience(store));
  return { teller, raw };
}

function stored(overrides: Partial<StoredStory> = {}): StoredStory {
  return {
    timestamp: "2026-09-04T12:00:00.000Z",
    level: "Information",
    title: "A story",
    storyId: overrides.storyId ?? Math.random().toString(36).slice(2),
    notes: [],
    ...overrides,
  };
}

describe("memoryStore", () => {
  it("round-trips every field of a story, including its chapters", async () => {
    const store = memoryStore();
    const { teller, raw } = tellerInto(store);
    teller.report("Order received", { what: { orderId: "ord_1", items: [{ sku: "A1" }] }, who: "user:42" });
    const chapter = teller.chapter({ origin: { what: "inventory" } });
    chapter.report("Reserved", { what: { sku: "A1" } });
    chapter.finish("Inventory reserved");
    teller.report("Charge failed", { level: "oops", error: new Error("declined", { cause: new Error("socket") }) });
    teller.finish("Order failed", { level: "oops", error: new Error("aborted") });
    await tick();

    expect(raw.length).toBe(2);
    for (const event of raw) {
      const kept = await store.get(event.storyId!);
      const { summarize: _summarize, kind: _kind, ...expected } = event;
      expect(kept).toEqual(expected);
    }
    const [main] = raw.filter((event) => !event.parentStoryId);
    const chapters = await store.children(main!.storyId!);
    expect(chapters.map((story) => story.title)).toEqual(["Inventory reserved"]);
    expect(chapters[0]!.parentStoryId).toBe(main!.storyId);
  });

  it("stores a copy: changing the event afterwards changes nothing kept", async () => {
    const store = memoryStore();
    const { teller, raw } = tellerInto(store);
    teller.report("beat", { what: { nested: { value: 1 } } });
    teller.finish("done");
    await tick();
    const event = raw[0]!;
    (event.notes[0]!.what as { nested: { value: number } }).nested.value = 99;
    event.title = "changed";
    const kept = await store.get(event.storyId!);
    expect(kept!.title).toBe("done");
    expect(kept!.notes[0]!.what).toEqual({ nested: { value: 1 } });
    expect("summarize" in kept!).toBe(false);
  });

  it("gives an id to a record that has none, and replaces on the same id", async () => {
    const store = memoryStore();
    const { storyId: _dropped, ...noId } = stored();
    await store.append(noId as unknown as StoredStory);
    expect(store.size).toBe(1);
    const [only] = await store.query();
    expect(typeof only!.storyId).toBe("string");
    await store.append(stored({ storyId: "same", title: "first" }));
    await store.append(stored({ storyId: "same", title: "second" }));
    expect(store.size).toBe(2);
    expect((await store.get("same"))!.title).toBe("second");
  });

  it("forgets the oldest past its capacity", async () => {
    const store = memoryStore({ capacity: 3 });
    for (const n of [1, 2, 3, 4, 5]) await store.append(stored({ storyId: `s${n}` }));
    expect(store.size).toBe(3);
    expect(await store.get("s1")).toBeUndefined();
    expect(await store.get("s2")).toBeUndefined();
    expect(await store.get("s5")).toBeDefined();
  });

  it("prunes only what is older than the boundary", async () => {
    const store = memoryStore();
    await store.append(stored({ storyId: "old", timestamp: "2026-09-01T00:00:00.000Z" }));
    await store.append(stored({ storyId: "edge", timestamp: "2026-09-02T00:00:00.000Z" }));
    await store.append(stored({ storyId: "new", timestamp: "2026-09-03T00:00:00.000Z" }));
    expect(await store.prune(new Date("2026-09-02T00:00:00.000Z"))).toBe(1);
    expect((await store.query({ order: "oldest" })).map((story) => story.storyId)).toEqual(["edge", "new"]);
    expect(await store.prune(new Date("2020-01-01"))).toBe(0);
  });
});

describe("storeAudience", () => {
  it("keeps every level by default, and filters when asked", async () => {
    const everything = memoryStore();
    const failures = memoryStore();
    const teller = new Storyteller();
    teller.audience.remove("console");
    teller.audience.add(storeAudience(everything));
    teller.audience.add(storeAudience(failures, { name: "failures", level: "Warning", accepts: (event) => event.title !== "skip me" }));
    teller.finish("fine");
    teller.finish("hmm", { level: "warn" });
    teller.finish("skip me", { level: "oops" });
    teller.finish("broken", { level: "oops" });
    await tick();
    expect(everything.size).toBe(4);
    expect((await failures.query({ order: "oldest" })).map((story) => story.title)).toEqual(["hmm", "broken"]);
  });

  it("reports a rejecting store through onAudienceError instead of throwing into the caller", async () => {
    const failures: string[] = [];
    const teller = new Storyteller({ onAudienceError: (_error, member) => { failures.push(member.name); } });
    teller.audience.remove("console");
    const broken = { ...memoryStore(), append: async () => { throw new Error("disk full"); } };
    teller.audience.add(storeAudience(broken, { name: "broken" }));
    expect(() => teller.finish("a story")).not.toThrow();
    await tick();
    await tick();
    expect(failures).toEqual(["broken"]);
  });
});

describe("queries", () => {
  const corpus: StoredStory[] = [
    stored({ storyId: "a", timestamp: "2026-09-04T10:00:00.000Z", title: "Checkout started", origin: { who: "payment-service" }, durationMs: 120, notes: [{ timestamp: "2026-09-04T10:00:00.000Z", note: "Cart validated", what: { items: 3 } }] }),
    stored({ storyId: "b", timestamp: "2026-09-04T11:00:00.000Z", title: "Checkout failed", level: "Error", origin: { who: "payment-service", where: { app: "web" } }, durationMs: 6000, error: { message: "Card declined" } }),
    stored({ storyId: "c", timestamp: "2026-09-04T12:00:00.000Z", title: "Nightly sync", level: "Warning", origin: { who: "sync-worker" }, durationMs: 90_000, notes: [{ timestamp: "2026-09-04T12:00:00.000Z", note: "Skipped rows", where: "billing.export" }] }),
    stored({ storyId: "d", timestamp: "2026-09-04T13:00:00.000Z", title: "Digest sent", parentStoryId: "c", notes: [{ timestamp: "2026-09-04T13:00:00.000Z", note: "Sent", error: { message: "one bounced" } }] }),
  ];
  const ids = (stories: StoredStory[]) => stories.map((story) => story.storyId);

  it("matches every criterion, and all of them at once", () => {
    expect(ids(applyQuery(corpus, { about: "checkout" }))).toEqual(["b", "a"]);
    expect(ids(applyQuery(corpus, { about: "CART" }))).toEqual(["a"]);
    expect(ids(applyQuery(corpus, { about: "billing" }))).toEqual(["c"]);
    expect(ids(applyQuery(corpus, { about: "bounced" }))).toEqual(["d"]);
    expect(ids(applyQuery(corpus, { from: "payment" }))).toEqual(["b", "a"]);
    expect(ids(applyQuery(corpus, { from: "web" }))).toEqual(["b"]);
    expect(ids(applyQuery(corpus, { level: "Error" }))).toEqual(["b"]);
    expect(ids(applyQuery(corpus, { level: ["Error", "Warning"], order: "oldest" }))).toEqual(["b", "c"]);
    expect(ids(applyQuery(corpus, { minimumLevel: "Warning" }))).toEqual(["c", "b"]);
    expect(ids(applyQuery(corpus, { failed: true }))).toEqual(["b"]);
    expect(ids(applyQuery(corpus, { failed: false }))).toEqual(["d", "c", "a"]);
    expect(ids(applyQuery(corpus, { slowerThanMs: 5000 }))).toEqual(["c", "b"]);
    expect(ids(applyQuery(corpus, { parentStoryId: "c" }))).toEqual(["d"]);
    expect(ids(applyQuery(corpus, { since: new Date("2026-09-04T11:00:00.000Z"), until: new Date("2026-09-04T13:00:00.000Z") }))).toEqual(["c", "b"]);
    expect(ids(applyQuery(corpus, { about: "checkout", from: "payment", failed: true }))).toEqual(["b"]);
    expect(ids(applyQuery(corpus, { limit: 2, offset: 1 }))).toEqual(["c", "b"]);
    expect(ids(applyQuery(corpus))).toEqual(["d", "c", "b", "a"]);
  });

  it("is the same matcher the store uses", async () => {
    const store = memoryStore();
    for (const story of corpus) await store.append(story);
    for (const query of [{ about: "checkout" }, { minimumLevel: "Warning" as const }, { slowerThanMs: 100, order: "oldest" as const }]) {
      expect(ids(await store.query(query))).toEqual(ids(applyQuery(corpus, query)));
      expect(corpus.filter((story) => matchesQuery(story, query)).length).toBe((await store.query(query)).length);
    }
  });

  it("derives the canonical row", () => {
    const row = canonicalRow(corpus[1]!);
    expect(row).toMatchObject({
      story_id: "b",
      parent_story_id: null,
      level: "Error",
      title: "Checkout failed",
      origin_who: "payment-service",
      origin_where: '{"app":"web"}',
      origin_what: null,
      duration_ms: 6000,
      error_message: "Card declined",
    });
    expect(JSON.parse(row.record)).toEqual(corpus[1]);
    expect(JSON.parse(row.notes)).toEqual([]);
    expect(row.search_text).toBe("Checkout failed\nCard declined");
    expect(storySearchText(corpus[0]!)).toBe("Checkout started\nCart validated");
    expect(toStoredStory(corpus[3]!)).toEqual(corpus[3]);
  });
});
