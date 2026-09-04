import { describe, it, expect } from "vitest";
import type { Emission, NoteEmission, StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A storyteller with a spy that hears everything, notes and stories alike */
function createStoryteller(narration?: "collected" | "live") {
  const emissions: Emission[] = [];
  const story = new Storyteller(narration ? { narration } : {});
  story.audience.remove("console");
  story.audience.add({
    name: "all",
    hears: ["note", "story"],
    hear: (emission) => { emissions.push(emission); },
  });

  const notes = () => emissions.filter((e): e is NoteEmission => e.kind === "note");
  const stories = () => emissions.filter((e): e is StoryEvent => e.kind === "story");

  return { story, emissions, notes, stories };
}

describe("chapter()", () => {
  it("links a chapter's story back to its parent", async () => {
    const { story, stories } = createStoryteller();
    const parentId = story.currentStoryId;

    const chapter = story.chapter();
    chapter.report("inside the chapter");
    chapter.finish("chapter done");
    await tick();

    expect(stories()[0]!.parentStoryId).toBe(parentId);
  });

  it("links a chapter's beats back to its parent", async () => {
    const { story, notes } = createStoryteller("live");
    const parentId = story.currentStoryId;

    const chapter = story.chapter();
    chapter.report("a beat");

    expect(notes()[0]!.parentStoryId).toBe(parentId);
    expect(notes()[0]!.storyId).not.toBe(parentId);
  });

  it("omits the field entirely on a top-level story", async () => {
    const { story, stories } = createStoryteller();

    story.finish("no parent");
    await tick();

    expect(stories()[0]!.parentStoryId).toBeUndefined();
    expect("parentStoryId" in stories()[0]!).toBe(false);
  });

  it("does not change the parent's own record", async () => {
    const { story, stories } = createStoryteller();

    story.report("parent beat");
    const chapter = story.chapter();
    chapter.report("chapter beat");
    chapter.finish("chapter");
    await tick();

    story.finish("parent");
    await tick();

    const parentStory = stories().find((event) => event.title === "parent")!;
    expect(parentStory.notes.length).toBe(1);
    expect(parentStory.notes[0]!.note).toBe("parent beat");
    expect(parentStory.parentStoryId).toBeUndefined();
  });

  it("keeps the link when the parent finishes first", async () => {
    const { story, stories } = createStoryteller();
    const parentId = story.currentStoryId;

    const chapter = story.chapter();
    story.finish("parent finishes early");
    await tick();

    chapter.report("still going");
    chapter.finish("chapter outlives parent");
    await tick();

    const chapterStory = stories().find((e) => e.title === "chapter outlives parent")!;
    expect(chapterStory.parentStoryId).toBe(parentId);
  });

  it("nests to arbitrary depth and reconstructs as a tree", async () => {
    const { story, stories } = createStoryteller();

    const level1 = story.chapter();
    const level2 = level1.chapter();
    const level3 = level2.chapter();

    const rootId = story.currentStoryId;
    const level1Id = level1.currentStoryId;
    const level2Id = level2.currentStoryId;

    level3.finish("deepest");
    level2.finish("middle");
    level1.finish("outer");
    story.finish("root");
    await tick();

    const byTitle = Object.fromEntries(stories().map((e) => [e.title, e]));

    expect(byTitle["root"]!.parentStoryId).toBeUndefined();
    expect(byTitle["outer"]!.parentStoryId).toBe(rootId);
    expect(byTitle["middle"]!.parentStoryId).toBe(level1Id);
    expect(byTitle["deepest"]!.parentStoryId).toBe(level2Id);
  });
});

describe("chapters share the parent's audience", () => {
  it("hears an audience added to the parent before the chapter existed", async () => {
    const { story, stories } = createStoryteller();

    const chapter = story.chapter();
    chapter.finish("heard");
    await tick();

    expect(stories().length).toBe(1);
  });

  it("hears an audience added to the parent after the chapter existed", async () => {
    const heard: Emission[] = [];
    const story = new Storyteller();
    story.audience.remove("console");

    const chapter = story.chapter();
    // Registered only now — a copied registry would miss this
    story.audience.add({ name: "late", hear: (e) => { heard.push(e); } });

    chapter.finish("late audience");
    await tick();

    expect(heard.length).toBe(1);
  });

  it("stops delivering to a chapter when the parent removes an audience", async () => {
    const heard: Emission[] = [];
    const story = new Storyteller();
    story.audience.remove("console");
    story.audience.add({ name: "temporary", hear: (e) => { heard.push(e); } });

    const chapter = story.chapter();
    story.audience.remove("temporary");

    chapter.finish("nobody listening");
    await tick();

    expect(heard.length).toBe(0);
  });

  it("does not replace a customized default audience on the shared registry", () => {
    const story = new Storyteller();
    const custom = { name: "console", hear: () => {} };
    story.audience.add(custom);

    const chapter = story.chapter();

    expect(chapter.audience.getAll().find((m) => m.name === "console")).toBe(custom);
  });

  it("gives a chapter the same registry instance, not a copy", () => {
    const story = new Storyteller();
    const chapter = story.chapter();
    expect(chapter.audience).toBe(story.audience);
  });
});

describe("chapters inherit settings", () => {
  it("inherits narration", () => {
    const { story, notes } = createStoryteller("live");

    const chapter = story.chapter();
    chapter.report("streamed without asking");

    expect(notes().length).toBe(1);
  });

  it("inherits the origin", async () => {
    const emissions: Emission[] = [];
    const story = new Storyteller({ origin: { who: "agent", where: "worker" } });
    story.audience.remove("console");
    story.audience.add({ name: "spy", hear: (e) => { emissions.push(e); } });

    const chapter = story.chapter();
    chapter.finish("inherited");
    await tick();

    const event = emissions[0] as StoryEvent;
    expect(event.origin?.who).toBe("agent");
    expect(event.origin?.where).toBe("worker");
  });

  it("merges an origin override over the parent's", async () => {
    const emissions: Emission[] = [];
    const story = new Storyteller({ origin: { who: "agent", where: "worker" } });
    story.audience.remove("console");
    story.audience.add({ name: "spy", hear: (e) => { emissions.push(e); } });

    const chapter = story.chapter({ origin: { what: "account-7", where: "shard-2" } });
    chapter.finish("merged");
    await tick();

    const event = emissions[0] as StoryEvent;
    expect(event.origin?.who).toBe("agent");        // inherited
    expect(event.origin?.what).toBe("account-7");   // added
    expect(event.origin?.where).toBe("shard-2");    // overridden
  });

  it("lets a chapter override narration", () => {
    const { story, notes } = createStoryteller("live");

    const chapter = story.chapter({ narration: "collected" });
    chapter.report("quiet");

    expect(notes().length).toBe(0);
  });

  it("inherits the level threshold", async () => {
    const emissions: Emission[] = [];
    const story = new Storyteller({ narration: "live", level: "Warning" });
    story.audience.remove("console");
    story.audience.add({
      name: "spy",
      hears: ["note", "story"],
      hear: (e) => { emissions.push(e); },
    });

    const chapter = story.chapter();
    chapter.report("quiet detail");
    chapter.report("loud", { level: "warn" });

    expect(emissions.length).toBe(1);
  });
});

describe("a nested run", () => {
  it("reconstructs the whole run from parentStoryId alone", async () => {
    const { story, stories } = createStoryteller();
    const rootId = story.currentStoryId;

    story.report("Starting sync");
    for (const account of ["acct-1", "acct-2", "acct-3"]) {
      const chapter = story.chapter({ origin: { what: account } });
      chapter.report("Fetching invoices");
      chapter.report("Reconciling");
      chapter.finish(`Synced ${account}`);
    }
    story.finish("Sync complete");
    await tick();

    const all = stories();
    expect(all.length).toBe(4);

    const root = all.find((event) => event.parentStoryId === undefined)!;
    const children = all.filter((event) => event.parentStoryId === rootId);

    expect(root.title).toBe("Sync complete");
    expect(children.length).toBe(3);
    expect(children.map((child) => child.origin?.what)).toEqual([
      "acct-1",
      "acct-2",
      "acct-3",
    ]);
    // Each chapter is a complete story in its own right
    expect(children.every((child) => child.notes.length === 2)).toBe(true);
  });
});
