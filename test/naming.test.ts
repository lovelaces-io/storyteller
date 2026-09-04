import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Emission, NoteEmission, StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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

  return { story, notes, stories };
}

describe("report()", () => {
  it("collects a beat and returns this for chaining", async () => {
    const { story, stories } = createStoryteller();

    const returned = story.report("one").report("two").report("three");
    expect(returned).toBe(story);

    story.finish("done");
    await tick();

    expect(stories()[0]!.notes.map((note) => note.note)).toEqual(["one", "two", "three"]);
  });

  it("takes a level in any accepted spelling", async () => {
    const { story, stories } = createStoryteller();

    story.report("a", { level: "warn" });
    story.report("b", { level: "Warning" });
    story.report("c", { level: "oops" });
    story.report("d", { level: "error" });
    story.report("e", { level: "info" });
    story.finish("levels");
    await tick();

    expect(stories()[0]!.notes.map((note) => note.level)).toEqual([
      "Warning",
      "Warning",
      "Error",
      "Error",
      undefined,
    ]);
  });

  it("emits immediately in live narration", () => {
    const { story, notes } = createStoryteller("live");

    story.report("as it happens");

    expect(notes().length).toBe(1);
    expect(notes()[0]!.note).toBe("as it happens");
  });

  it("accepts any value, not just a string", async () => {
    const { story, stories } = createStoryteller();

    story.report({ message: "queued", jobId: 3 });
    story.finish("done");
    await tick();

    expect(stories()[0]!.notes[0]!.note).toBe("queued");
  });
});

describe("finish()", () => {
  it("emits the collected story at Information by default", async () => {
    const { story, stories } = createStoryteller();

    story.report("a");
    story.finish("all good");
    await tick();

    expect(stories()[0]!.level).toBe("Information");
    expect(stories()[0]!.title).toBe("all good");
    expect(stories()[0]!.notes.length).toBe(1);
  });

  it("takes a level", async () => {
    const { story, stories } = createStoryteller();

    story.finish("careful", { level: "warn" });
    await tick();

    expect(stories()[0]!.level).toBe("Warning");
  });

  it("takes an error and normalizes it", async () => {
    const { story, stories } = createStoryteller();

    story.finish("broke", { level: "oops", error: new Error("boom") });
    await tick();

    expect(stories()[0]!.level).toBe("Error");
    expect(stories()[0]!.error?.message).toBe("boom");
  });

  it("keeps the one-shot .to() handle", async () => {
    const only: StoryEvent[] = [];
    const other: StoryEvent[] = [];

    const story = new Storyteller();
    story.audience.remove("console");
    story.audience.add({
      name: "wanted",
      hear: (e) => { if (e.kind === "story") only.push(e); },
    });
    story.audience.add({
      name: "unwanted",
      hear: (e) => { if (e.kind === "story") other.push(e); },
    });

    story.finish("targeted").to("wanted");
    await tick();

    expect(only.length).toBe(1);
    expect(other.length).toBe(0);
  });

  it("clears the notes for the next story", async () => {
    const { story, stories } = createStoryteller();

    story.report("first story note");
    story.finish("first");
    await tick();
    story.finish("second");
    await tick();

    expect(stories()[0]!.notes.length).toBe(1);
    expect(stories()[1]!.notes.length).toBe(0);
  });
});

describe("deprecated aliases", () => {
  it("tell() behaves exactly like finish()", async () => {
    const viaAlias = createStoryteller();
    viaAlias.story.note("a");
    viaAlias.story.tell("title");

    const viaNew = createStoryteller();
    viaNew.story.report("a");
    viaNew.story.finish("title");

    await tick();

    const oldEvent = viaAlias.stories()[0]!;
    const newEvent = viaNew.stories()[0]!;

    expect(oldEvent.level).toBe(newEvent.level);
    expect(oldEvent.title).toBe(newEvent.title);
    expect(oldEvent.notes.map((n) => n.note)).toEqual(newEvent.notes.map((n) => n.note));
  });

  it("warn() maps to the Warning level", async () => {
    const { story, stories } = createStoryteller();
    story.warn("careful");
    await tick();
    expect(stories()[0]!.level).toBe("Warning");
  });

  it("oops() maps to the Error level and keeps the error", async () => {
    const { story, stories } = createStoryteller();
    story.oops("broke", new Error("boom"));
    await tick();
    expect(stories()[0]!.level).toBe("Error");
    expect(stories()[0]!.error?.message).toBe("boom");
  });

  it("note() behaves exactly like report()", async () => {
    const { story, stories } = createStoryteller();
    story.note("via note", { what: { a: 1 } });
    story.finish("done");
    await tick();

    expect(stories()[0]!.notes[0]!.note).toBe("via note");
    expect(stories()[0]!.notes[0]!.what).toEqual({ a: 1 });
  });
});

describe("deprecation warnings", () => {
  const environment =
    (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ??
    ({} as Record<string, string | undefined>);
  const original = environment["STORYTELLER_DEPRECATION_WARNINGS"];

  beforeEach(() => {
    delete environment["STORYTELLER_DEPRECATION_WARNINGS"];
  });

  afterEach(() => {
    if (original === undefined) delete environment["STORYTELLER_DEPRECATION_WARNINGS"];
    else environment["STORYTELLER_DEPRECATION_WARNINGS"] = original;
  });

  it("stays silent by default", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const story = new Storyteller();
    story.audience.remove("console");
    story.tell("quiet");
    await tick();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
