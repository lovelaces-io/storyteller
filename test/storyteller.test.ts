import { describe, it, expect } from "vitest";
import type { StoryEvent, AudienceMember } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";
import { dbAudience } from "../src/audiences/dbAudience";

/** Helper: create a storyteller with a spy audience and wait one tick for delivery */
function createTestStoryteller() {
  const events: StoryEvent[] = [];
  const audience: AudienceMember = {
    name: "spy",
    hear: (event) => { events.push(event); },
  };
  const story = new Storyteller();
  story.audience.add(audience);
  return { story, events };
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Storyteller", () => {
  it("clears notes after telling a story", async () => {
    const savedEvents: StoryEvent[] = [];
    const story = new Storyteller();
    story.audience.add(
      dbAudience(async (event) => {
        savedEvents.push(event);
      })
    );

    story.note("one").note("two");
    story.warn("hello");
    await tick();

    expect(savedEvents.length).toBe(1);
    expect(savedEvents[0]!.notes.length).toBe(2);

    story.tell("second");
    await tick();

    // "tell" events are filtered out by dbAudience, so count stays at 1
    expect(savedEvents.length).toBe(1);
  });

  it("note() returns this for chaining", () => {
    const story = new Storyteller();
    const result = story.note("one").note("two").note("three");
    expect(result).toBe(story);
  });

  it("reset() clears notes and returns this", async () => {
    const { story, events } = createTestStoryteller();

    story.note("should be gone");
    const result = story.reset();
    expect(result).toBe(story);

    story.tell("after reset");
    await tick();

    expect(events.length).toBe(1);
    expect(events[0]!.notes.length).toBe(0);
  });

  it("tell() delivers to all audiences", async () => {
    const { story, events } = createTestStoryteller();

    story.note("check");
    story.tell("success story");
    await tick();

    expect(events.length).toBe(1);
    expect(events[0]!.level).toBe("Information");
    expect(events[0]!.title).toBe("success story");
  });

  it("warn() delivers with warn level", async () => {
    const { story, events } = createTestStoryteller();

    story.note("concern");
    story.warn("something off");
    await tick();

    expect(events.length).toBe(1);
    expect(events[0]!.level).toBe("Warning");
  });

  it("oops() delivers with oops level and attaches error", async () => {
    const { story, events } = createTestStoryteller();

    const error = new Error("boom");
    story.note("tried something");
    story.oops("it broke", error);
    await tick();

    expect(events.length).toBe(1);
    expect(events[0]!.level).toBe("Error");
    expect(events[0]!.error?.message).toBe("boom");
    expect(events[0]!.error?.name).toBe("Error");
    expect(events[0]!.error?.stack).toBeDefined();
  });

  it("oops() normalizes non-Error values", async () => {
    const { story, events } = createTestStoryteller();

    story.oops("string error", "something went wrong");
    await tick();

    expect(events[0]!.error?.message).toBe("something went wrong");
  });

  it("oops() normalizes Error with cause", async () => {
    const { story, events } = createTestStoryteller();

    const cause = new Error("root cause");
    const error = new Error("wrapper", { cause });
    story.oops("chained", error);
    await tick();

    expect(events[0]!.error?.cause).toBe(cause);
  });

  it(".to() targets specific audiences by name", async () => {
    const spyA: StoryEvent[] = [];
    const spyB: StoryEvent[] = [];

    const story = new Storyteller();
    story.audience.add({ name: "a", hear: (e) => { spyA.push(e); } });
    story.audience.add({ name: "b", hear: (e) => { spyB.push(e); } });

    story.note("targeted");
    story.tell("only for a").to("a");
    await tick();

    expect(spyA.length).toBe(1);
    expect(spyB.length).toBe(0);
  });

  it("includes origin when provided", async () => {
    const events: StoryEvent[] = [];
    const story = new Storyteller({
      origin: { who: "test-service", where: "checkout" },
    });
    story.audience.add({ name: "spy", hear: (e) => { events.push(e); } });

    story.tell("with origin");
    await tick();

    expect(events[0]!.origin?.who).toBe("test-service");
    expect(events[0]!.origin?.where).toBe("checkout");
  });

  it("omits origin when not provided", async () => {
    const { story, events } = createTestStoryteller();

    story.tell("no origin");
    await tick();

    expect(events[0]!.origin).toBeUndefined();
  });

  it("note() attaches context fields (who, what, where, error)", async () => {
    const { story, events } = createTestStoryteller();

    story.note("with context", {
      who: "user-123",
      what: { action: "click" },
      where: "dashboard",
      error: new Error("minor"),
    });
    story.tell("context test");
    await tick();

    const note = events[0]!.notes[0]!;
    expect(note.who).toBe("user-123");
    expect(note.what).toEqual({ action: "click" });
    expect(note.where).toBe("dashboard");
    expect(note.error?.message).toBe("minor");
  });

  it("note() omits empty context fields", async () => {
    const { story, events } = createTestStoryteller();

    story.note("minimal");
    story.tell("clean");
    await tick();

    const note = events[0]!.notes[0]!;
    expect(note.who).toBeUndefined();
    expect(note.what).toBeUndefined();
    expect(note.where).toBeUndefined();
    expect(note.error).toBeUndefined();
  });

  it("event has a timestamp", async () => {
    const { story, events } = createTestStoryteller();

    story.tell("timestamped");
    await tick();

    expect(events[0]!.timestamp).toBeDefined();
    expect(new Date(events[0]!.timestamp).getTime()).not.toBeNaN();
  });

  it("notes have timestamps", async () => {
    const { story, events } = createTestStoryteller();

    story.note("first");
    story.note("second");
    story.tell("with notes");
    await tick();

    for (const note of events[0]!.notes) {
      expect(new Date(note.timestamp).getTime()).not.toBeNaN();
    }
  });

  it("summarize() returns text and data without clearing notes", async () => {
    const story = new Storyteller();

    story.note("one").note("two");
    const summary = story.summarize({ title: "preview", colors: false });

    expect(summary.text).toContain("preview");
    expect(summary.data.notes.length).toBe(2);

    // Notes should still be there for the next tell
    const events: StoryEvent[] = [];
    story.audience.add({ name: "spy", hear: (e) => { events.push(e); } });
    story.tell("after summarize");
    await tick();

    expect(events[0]!.notes.length).toBe(2);
  });

  it("event.summarize() is non-enumerable (clean JSON output)", async () => {
    const { story, events } = createTestStoryteller();

    story.tell("json clean");
    await tick();

    const json = JSON.stringify(events[0]!);
    expect(json).not.toContain("summarize");
    expect(typeof events[0]!.summarize).toBe("function");
  });

  it("audience accepts() filter is respected", async () => {
    const events: StoryEvent[] = [];
    const story = new Storyteller();
    story.audience.add({
      name: "warns-only",
      accepts: (event) => event.level === "Warning",
      hear: (e) => { events.push(e); },
    });

    story.tell("ignored");
    await tick();
    expect(events.length).toBe(0);

    story.warn("accepted");
    await tick();
    expect(events.length).toBe(1);
  });

  it("delivers to async audiences without blocking", async () => {
    const events: StoryEvent[] = [];
    const story = new Storyteller();
    story.audience.add({
      name: "slow",
      hear: async (e) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push(e);
      },
    });

    story.tell("async test");
    await tick();
    // Give async audience time to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events.length).toBe(1);
  });
});

describe("AudienceRegistry", () => {
  it("add() replaces existing audience with same name", async () => {
    const eventsA: StoryEvent[] = [];
    const eventsB: StoryEvent[] = [];

    const story = new Storyteller();
    story.audience.add({ name: "test", hear: (e) => { eventsA.push(e); } });
    story.audience.add({ name: "test", hear: (e) => { eventsB.push(e); } });

    story.tell("replaced");
    await tick();

    expect(eventsA.length).toBe(0);
    expect(eventsB.length).toBe(1);
  });

  it("remove() stops delivery to that audience", async () => {
    const events: StoryEvent[] = [];
    const story = new Storyteller();
    story.audience.add({ name: "removable", hear: (e) => { events.push(e); } });
    story.audience.remove("removable");

    story.tell("after remove");
    await tick();

    expect(events.length).toBe(0);
  });

  it("getAll() returns all registered members", () => {
    const story = new Storyteller();
    // Default console audience is always registered
    const all = story.audience.getAll();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.some((m) => m.name === "console")).toBe(true);
  });

  it("has() checks if an audience is registered", () => {
    const story = new Storyteller();
    expect(story.audience.has("console")).toBe(true);
    expect(story.audience.has("nonexistent")).toBe(false);
  });

  it("names() lists all registered audience names", () => {
    const story = new Storyteller();
    story.audience.add({ name: "custom", hear: () => {} });
    const names = story.audience.names();
    expect(names).toContain("console");
    expect(names).toContain("custom");
  });
});
