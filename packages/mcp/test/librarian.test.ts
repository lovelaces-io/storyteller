import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Storyteller, memoryStore, storeAudience, type StoredStory, type StoryStore } from "@lovelaces-io/storyteller";
import { fileStore } from "@lovelaces-io/storyteller/store/file";
import { createLibrarian } from "../src/server.js";
import { MAX_LIMIT, MAX_NOTES } from "../src/library.js";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** A store that records every method the Librarian touches, so writes cannot hide */
function watched(store: StoryStore): { store: StoryStore; calls: string[] } {
  const calls: string[] = [];
  const proxy = new Proxy(store, {
    get(target, property, receiver) {
      if (typeof property === "string") calls.push(property);
      return Reflect.get(target, property, receiver);
    },
  });
  return { store: proxy, calls };
}

let dir: string;
let calls: string[];
let client: Client;
let ids: { failed: string; chapter: string; digest: string };

const text = (result: Awaited<ReturnType<Client["callTool"]>>) => (result.content as { type: string; text: string }[])[0]!.text;
const json = (result: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse(text(result));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "storyteller-mcp-"));
  const file = fileStore(join(dir, "stories.jsonl"));

  // Real stories from the real library, through a file store — the shape an agent would actually see
  const teller = new Storyteller({ origin: { who: "payment-service", where: { region: "us-east-1" } } });
  teller.audience.remove("console");
  teller.audience.add(storeAudience(file));
  teller.report("Order received", { what: { orderId: "ord_9f2", customer: { email: "a@example.com", password: "hunter2" } } });
  const chapter = teller.chapter({ origin: { what: "inventory" } });
  chapter.report("Reserved stock", { what: { sku: "A1" } });
  chapter.finish("Inventory reserved");
  teller.report("Charge failed", { level: "oops", error: new Error(`Gateway rejected key ${["sk_live", "_4eC39HqLyjWDarjtT1zdp7dc"].join("")}`) });
  teller.finish("Checkout failed", { level: "oops", error: new Error("Card declined") });
  teller.report("Digest built", { what: { recipients: 12 } });
  teller.finish("Nightly digest sent");
  teller.finish("Checkout failed", { level: "oops", error: new Error("Card declined") });
  await tick();
  await file.flush();

  const all = await file.query({ order: "oldest" });
  const failed = all.find((story) => story.title === "Checkout failed")!;
  ids = {
    failed: failed.storyId,
    chapter: all.find((story) => story.title === "Inventory reserved")!.storyId,
    digest: all.find((story) => story.title === "Nightly digest sent")!.storyId,
  };

  const guarded = watched(file);
  calls = guarded.calls;
  const server = createLibrarian({ store: guarded.store, now: () => new Date() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await rm(dir, { recursive: true, force: true });
});

describe("the Librarian over MCP", () => {
  it("offers four tools, every one read-only", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["find_related", "get_story", "search_stories", "summarize_period"]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.description!.length).toBeGreaterThan(40);
    }
  });

  it("answers 'the stories where checkout failed today' with summaries and the compiled query", async () => {
    const result = json(await client.callTool({ name: "search_stories", arguments: { about: "checkout", failing: true, since: "24h" } }));
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.stories).toHaveLength(2);
    expect(result.stories[0]).toMatchObject({ title: "Checkout failed", level: "Error", error: "Card declined", origin: "payment-service / {\"region\":\"us-east-1\"}" });
    expect(result.stories.every((story: { notes: number }) => typeof story.notes === "number")).toBe(true);
    expect(result.query).toMatchObject({ about: "checkout", failed: true });
    expect(typeof result.query.since).toBe("string");
  });

  it("opens one story complete, with its chapters, and a redacted value stays redacted", async () => {
    const result = json(await client.callTool({ name: "get_story", arguments: { storyId: ids.failed } }));
    expect(result.story.storyId).toBe(ids.failed);
    expect(result.story.notes.map((note: { note: string }) => note.note)).toEqual(["Order received", "Charge failed"]);
    expect(result.story.notes[0].what.customer.password).toBe("[redacted]");
    expect(result.story.notes[1].error.message).toBe("Gateway rejected key [redacted]");
    expect(text(await client.callTool({ name: "get_story", arguments: { storyId: ids.failed } }))).not.toContain("sk_live");
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]).toMatchObject({ storyId: ids.chapter, title: "Inventory reserved" });
  });

  it("summarizes a period", async () => {
    const result = json(await client.callTool({ name: "summarize_period", arguments: { since: "1h" } }));
    expect(result.total).toBe(4);
    expect(result.byLevel).toEqual({ Information: 2, Warning: 0, Error: 2 });
    expect(result.failed).toBe(2);
    expect(result.topTitles[0]).toEqual({ title: "Checkout failed", count: 2, level: "Error" });
    expect(result.origins[0].origin).toContain("payment-service");
    expect(result.recentFailures).toHaveLength(2);
  });

  it("pulls on a thread", async () => {
    const result = json(await client.callTool({ name: "find_related", arguments: { storyId: ids.failed } }));
    expect(result.chapters.map((story: { storyId: string }) => story.storyId)).toEqual([ids.chapter]);
    expect(result.sameTitle).toHaveLength(1);
    expect(result.sameTitle[0].title).toBe("Checkout failed");
    expect(result.sameOrigin.map((story: { title: string }) => story.title)).toContain("Nightly digest sent");
    const fromChapter = json(await client.callTool({ name: "find_related", arguments: { storyId: ids.chapter } }));
    expect(fromChapter.parent.storyId).toBe(ids.failed);
  });

  it("refuses bad input with a message the agent can act on, instead of a crash", async () => {
    const bad = await client.callTool({ name: "search_stories", arguments: { since: "yesterday" } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('Not a duration: "yesterday"');
    const missing = await client.callTool({ name: "get_story", arguments: { storyId: "nope" } });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain("No story with id nope");
  });

  it("never wrote or deleted anything", () => {
    const touched = new Set(calls);
    expect(touched.has("append")).toBe(false);
    expect(touched.has("prune")).toBe(false);
    expect([...touched].sort()).toEqual(["children", "get", "query"]);
  });
});

describe("sized for a context window", () => {
  it("bounds a search across ten thousand stories", async () => {
    const store = memoryStore({ capacity: 20_000 });
    for (let i = 0; i < 10_000; i++) {
      const story: StoredStory = {
        storyId: `s${i}`,
        timestamp: new Date(NOW.getTime() - i * 1000).toISOString(),
        level: i % 7 === 0 ? "Error" : "Information",
        title: i % 7 === 0 ? "Sync failed" : "Sync finished",
        origin: { who: "sync-worker" },
        notes: [{ timestamp: NOW.toISOString(), note: "x".repeat(5000) }],
      };
      await store.append(story);
    }
    const server = createLibrarian({ store, now: () => NOW });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const big = new Client({ name: "test", version: "0.0.0" });
    await big.connect(clientTransport);

    // The schema refuses an out-of-range limit before any clamp runs
    const tooMany = await big.callTool({ name: "search_stories", arguments: { about: "sync", limit: 1000 } });
    expect(tooMany.isError).toBe(true);

    const started = performance.now();
    const result = await big.callTool({ name: "search_stories", arguments: { about: "sync", failing: true, since: "7d", limit: MAX_LIMIT } });
    const elapsed = performance.now() - started;
    const parsed = json(result);
    expect(parsed.total).toBe(Math.ceil(10_000 / 7));
    expect(parsed.truncated).toBe(true);
    expect(parsed.stories).toHaveLength(MAX_LIMIT);
    expect(text(result).length).toBeLessThan(60_000);
    expect(elapsed).toBeLessThan(2000);

    const one = json(await big.callTool({ name: "get_story", arguments: { storyId: "s7" } }));
    expect(one.story.notes[0].note.length).toBeLessThanOrEqual(2000 + 20);
    expect(one.story.notes[0].note).toMatch(/…\[\+\d+ chars\]$/);
    await big.close();
  });

  it("keeps the first and last notes of a very long story and says what was cut", async () => {
    const store = memoryStore();
    const notes = Array.from({ length: MAX_NOTES + 50 }, (_, i) => ({ timestamp: NOW.toISOString(), sequence: i, note: `beat ${i}` }));
    await store.append({ storyId: "long", timestamp: NOW.toISOString(), level: "Information", title: "Long", notes });
    const server = createLibrarian({ store });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const c = new Client({ name: "test", version: "0.0.0" });
    await c.connect(clientTransport);
    const result = json(await c.callTool({ name: "get_story", arguments: { storyId: "long" } }));
    expect(result.story.notes).toHaveLength(MAX_NOTES);
    expect(result.story.notes[0].note).toBe("beat 0");
    expect(result.story.notes[MAX_NOTES - 1].note).toBe(`beat ${MAX_NOTES + 49}`);
    expect(result.notesTruncated).toEqual({ kept: MAX_NOTES, omitted: 50 });
    await c.close();
  });
});
