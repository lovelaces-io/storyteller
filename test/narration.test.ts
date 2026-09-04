import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Emission, NoteEmission, StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Collect every emission an audience that listens for both kinds would hear */
function createListeningStoryteller(narration?: "collected" | "live" | "both") {
  const emissions: Emission[] = [];
  const story = new Storyteller(narration ? { narration } : {});
  story.audience.remove("console");
  story.audience.add({
    name: "all",
    hears: ["note", "story"],
    hear: (emission) => {
      emissions.push(emission);
    },
  });

  const notes = () => emissions.filter((e): e is NoteEmission => e.kind === "note");
  const stories = () => emissions.filter((e): e is StoryEvent => e.kind === "story");

  return { story, emissions, notes, stories };
}

describe("narration — collected (the default)", () => {
  it("emits no notes, only the story", async () => {
    const { story, notes, stories } = createListeningStoryteller();

    story.note("first").note("second");
    story.tell("done");
    await tick();

    expect(notes().length).toBe(0);
    expect(stories().length).toBe(1);
    expect(stories()[0]!.notes.length).toBe(2);
  });

  it("still emits a single note on demand when asked", async () => {
    const { story, notes } = createListeningStoryteller();

    story.note("quiet");
    story.note("urgent", { live: true });
    await tick();

    expect(notes().length).toBe(1);
    expect(notes()[0]!.note).toBe("urgent");
  });
});

describe("narration — live", () => {
  it("emits each note as it happens", async () => {
    const { story, notes } = createListeningStoryteller("live");

    story.note("first");
    expect(notes().length).toBe(1);

    story.note("second");
    expect(notes().length).toBe(2);
  });

  it("still emits the story at the end", async () => {
    const { story, notes, stories } = createListeningStoryteller("live");

    story.note("first").note("second");
    story.tell("done");
    await tick();

    expect(notes().length).toBe(2);
    expect(stories().length).toBe(1);
    expect(stories()[0]!.notes.length).toBe(2);
  });

  it("treats the legacy 'both' value as live", async () => {
    const { story, notes, stories } = createListeningStoryteller("both");

    story.note("beat");
    story.tell("done");
    await tick();

    expect(notes().length).toBe(1);
    expect(stories().length).toBe(1);
  });

  it("can be switched on at runtime without replaying buffered notes", async () => {
    const { story, notes } = createListeningStoryteller();

    story.note("before the switch");
    story.narrate("live");
    story.note("after the switch");

    expect(notes().length).toBe(1);
    expect(notes()[0]!.note).toBe("after the switch");
  });

  it("can be switched back off", () => {
    const { story, notes } = createListeningStoryteller("live");

    story.note("heard");
    story.narrate("collected");
    story.note("not heard");

    expect(notes().length).toBe(1);
  });

  it("targets specific audiences per note", () => {
    const heard: string[] = [];
    const story = new Storyteller({ narration: "live" });
    story.audience.remove("console");
    story.audience.add({
      name: "a",
      hears: ["note"],
      hear: () => { heard.push("a"); },
    });
    story.audience.add({
      name: "b",
      hears: ["note"],
      hear: () => { heard.push("b"); },
    });

    story.note("for a only", { to: ["a"] });

    expect(heard).toEqual(["a"]);
  });
});

describe("audience opt-in", () => {
  it("does not deliver notes to an audience that never asked for them", async () => {
    const received: Emission[] = [];
    const story = new Storyteller({ narration: "live" });
    story.audience.remove("console");
    // No `hears` — the shape every audience written before live narration has
    story.audience.add({
      name: "legacy",
      hear: (emission) => { received.push(emission); },
    });

    story.note("streamed");
    story.tell("told");
    await tick();

    expect(received.length).toBe(1);
    expect(received[0]!.kind).toBe("story");
  });

  it("delivers only notes to a notes-only audience", async () => {
    const received: Emission[] = [];
    const story = new Storyteller({ narration: "live" });
    story.audience.remove("console");
    story.audience.add({
      name: "beats-only",
      hears: ["note"],
      hear: (emission) => { received.push(emission); },
    });

    story.note("one").note("two");
    story.tell("told");
    await tick();

    expect(received.length).toBe(2);
    expect(received.every((emission) => emission.kind === "note")).toBe(true);
  });
});

describe("correlation", () => {
  it("shares one storyId across every note and the story they belong to", async () => {
    const { story, notes, stories } = createListeningStoryteller("live");

    story.note("one").note("two");
    story.tell("done");
    await tick();

    const storyId = stories()[0]!.storyId;
    expect(storyId).toBeTruthy();
    for (const note of notes()) {
      expect(note.storyId).toBe(storyId);
    }
  });

  it("gives each story a different id", async () => {
    const { story, stories } = createListeningStoryteller();

    story.tell("first");
    await tick();
    story.tell("second");
    await tick();

    expect(stories()[0]!.storyId).not.toBe(stories()[1]!.storyId);
  });

  it("starts a new story id after reset", () => {
    const story = new Storyteller();
    story.audience.remove("console");

    const before = story.currentStoryId;
    story.reset();

    expect(story.currentStoryId).not.toBe(before);
  });

  it("numbers notes gap-free from zero", async () => {
    const { story, notes } = createListeningStoryteller("live");

    story.note("a").note("b").note("c");

    expect(notes().map((note) => note.sequence)).toEqual([0, 1, 2]);
  });

  it("restarts numbering for the next story", async () => {
    const { story, notes } = createListeningStoryteller("live");

    story.note("a").note("b");
    story.tell("first");
    await tick();
    story.note("c");

    expect(notes().map((note) => note.sequence)).toEqual([0, 1, 0]);
  });
});

describe("the replay invariant", () => {
  // The load-bearing guarantee of the whole design: whichever way you tune in,
  // you can recover exactly the same record.
  it("reconstructs the story record from its streamed notes", async () => {
    const { story, notes, stories } = createListeningStoryteller("live");

    story.note("Fetching records", { what: { source: "api" } });
    story.note("Rate limited", { level: "Warning", where: "upstream" });
    story.note("Retrying", { who: "worker-2" });
    story.note(new Error("gateway timeout"));
    story.tell("Sync complete");
    await tick();

    const told = stories()[0]!;

    const replayed = notes()
      .filter((note) => note.storyId === told.storyId)
      .sort((left, right) => left.sequence - right.sequence)
      .map((note) => {
        // Strip the fields that exist only to make a beat routable on its own
        const { kind, storyId, level, origin, ...rest } = note;
        void kind;
        void storyId;
        void origin;
        return level === "Information" ? rest : { ...rest, level };
      });

    expect(replayed).toEqual(told.notes);
  });

  it("holds for a story with many notes", async () => {
    const { story, notes, stories } = createListeningStoryteller("live");

    for (let index = 0; index < 200; index += 1) {
      story.note(`beat ${index}`, { what: { index } });
    }
    story.tell("long story");
    await tick();

    const told = stories()[0]!;
    expect(told.notes.length).toBe(200);

    const replayedText = notes()
      .sort((left, right) => left.sequence - right.sequence)
      .map((note) => note.note);

    expect(replayedText).toEqual(told.notes.map((note) => note.note));
  });
});

describe("note() accepts any input", () => {
  it("uses a string as its own text", async () => {
    const { story, stories } = createListeningStoryteller();
    story.note("plain text");
    story.tell("done");
    await tick();

    expect(stories()[0]!.notes[0]!.note).toBe("plain text");
    expect(stories()[0]!.notes[0]!.what).toBeUndefined();
  });

  it("describes an error and attaches it", async () => {
    const { story, stories } = createListeningStoryteller();
    story.note(new Error("disk full"));
    story.tell("done");
    await tick();

    const note = stories()[0]!.notes[0]!;
    expect(note.note).toBe("Error: disk full");
    expect(note.error?.message).toBe("disk full");
  });

  it("pulls a headline field out of an object and keeps the whole value", async () => {
    const { story, stories } = createListeningStoryteller();
    story.note({ message: "job queued", jobId: 7 });
    story.tell("done");
    await tick();

    const note = stories()[0]!.notes[0]!;
    expect(note.note).toBe("job queued");
    expect(note.what).toEqual({ message: "job queued", jobId: 7 });
  });

  it("falls back to a type label for an object with no headline", async () => {
    class Payload {
      constructor(public size: number) {}
    }
    const { story, stories } = createListeningStoryteller();
    story.note(new Payload(3));
    story.tell("done");
    await tick();

    const note = stories()[0]!.notes[0]!;
    expect(note.note).toBe("Payload");
    expect(note.what).toEqual({ "@type": "Payload", size: 3 });
  });

  it("normalizes a circular object instead of breaking the record", async () => {
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic["self"] = cyclic;

    const { story, stories } = createListeningStoryteller();
    story.note("cyclic context", { what: cyclic });
    story.tell("done");
    await tick();

    expect(() => JSON.stringify(stories()[0])).not.toThrow();
    expect(stories()[0]!.notes[0]!.what).toEqual({
      name: "root",
      self: "[Circular → $]",
    });
  });

  it("redacts secrets in note context", async () => {
    const { story, stories } = createListeningStoryteller();
    story.note("authenticating", { what: { user: "ada", password: "hunter2" } });
    story.tell("done");
    await tick();

    expect(stories()[0]!.notes[0]!.what).toEqual({
      user: "ada",
      password: "[redacted]",
    });
  });

  it("normalizes origin as well as notes", async () => {
    const emissions: Emission[] = [];
    const story = new Storyteller({
      origin: { who: "worker", where: { app: "web" }, what: new Set(["a"]) },
    });
    story.audience.remove("console");
    story.audience.add({ name: "spy", hear: (emission) => { emissions.push(emission); } });

    story.tell("done");
    await tick();

    const told = emissions[0] as StoryEvent;
    expect(told.origin?.what).toEqual({ "@type": "Set", values: ["a"] });
    expect(() => JSON.stringify(told)).not.toThrow();
  });
});

describe("narration from the environment", () => {
  // Reached through globalThis so the suite does not need Node type definitions
  const environment =
    (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ??
    ({} as Record<string, string | undefined>);
  const original = environment["STORYTELLER_NARRATION"];

  beforeEach(() => {
    delete environment["STORYTELLER_NARRATION"];
  });

  afterEach(() => {
    if (original === undefined) {
      delete environment["STORYTELLER_NARRATION"];
    } else {
      environment["STORYTELLER_NARRATION"] = original;
    }
  });

  it("turns on live narration with no code change", () => {
    environment["STORYTELLER_NARRATION"] = "live";
    const { story, notes } = createListeningStoryteller();

    story.note("streamed by env");

    expect(notes().length).toBe(1);
  });

  it("falls back to collected for an unrecognized value", () => {
    environment["STORYTELLER_NARRATION"] = "nonsense";
    const { story, notes } = createListeningStoryteller();

    story.note("buffered");

    expect(notes().length).toBe(0);
  });

  it("lets an explicit option win over the environment", () => {
    environment["STORYTELLER_NARRATION"] = "live";
    const { story, notes } = createListeningStoryteller("collected");

    story.note("buffered");

    expect(notes().length).toBe(0);
  });
});

describe("every input is carried as structured data", () => {
  /** Report one value and read back the note it produced */
  async function reportAndRead(value: unknown) {
    const { story, stories } = createListeningStoryteller();
    story.report(value);
    story.finish("done");
    await tick();
    return stories()[0]!.notes[0]!;
  }

  it("keeps a number readable as a number", async () => {
    const note = await reportAndRead(42);
    expect(note.note).toBe("42");
    expect(note.what).toBe(42);
  });

  it("keeps a boolean readable as a boolean", async () => {
    expect((await reportAndRead(true)).what).toBe(true);
  });

  it("keeps a date readable as an ISO string", async () => {
    const note = await reportAndRead(new Date("2026-01-01T00:00:00.000Z"));
    expect(note.what).toBe("2026-01-01T00:00:00.000Z");
  });

  it("carries a bigint", async () => {
    expect((await reportAndRead(10n)).what).toBe("10n");
  });

  it("leaves a plain string as text alone, with no redundant context", async () => {
    const note = await reportAndRead("just a message");
    expect(note.note).toBe("just a message");
    expect(note.what).toBeUndefined();
  });

  it("puts an error in the error field rather than duplicating it as context", async () => {
    const note = await reportAndRead(new Error("disk full"));
    expect(note.error?.message).toBe("disk full");
    expect(note.what).toBeUndefined();
  });

  it("produces a JSON-serializable note for every input type", async () => {
    class Order { constructor(public id: string) {} }
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    const inputs: unknown[] = [
      "text", 42, true, null, [1, 2], { a: 1 }, new Order("o-1"),
      new Error("boom"), new Map([["k", "v"]]), new Set([1]),
      new Date(), new Uint8Array([1, 2]), circular, 10n, () => {},
    ];

    for (const input of inputs) {
      const note = await reportAndRead(input);
      expect(() => JSON.stringify(note)).not.toThrow();
      expect(typeof note.note).toBe("string");
    }
  });
});
