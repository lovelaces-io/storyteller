import { describe, it, expect, vi } from "vitest";
import type { AudienceMember, Emission, StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** An audience that always throws when it hears anything */
function createBrokenAudience(name = "broken"): AudienceMember {
  return {
    name,
    hears: ["note", "story"],
    hear: () => {
      throw new Error("audience exploded");
    },
  };
}

describe("audience failures", () => {
  it("does not stop other audiences from hearing the emission", async () => {
    const heard: Emission[] = [];
    const story = new Storyteller({ onAudienceError: () => {} });
    story.audience.remove("console");
    story.audience.add(createBrokenAudience());
    story.audience.add({ name: "healthy", hear: (e) => { heard.push(e); } });

    story.tell("still delivered");
    await tick();

    expect(heard.length).toBe(1);
  });

  it("does not throw into caller code", async () => {
    const story = new Storyteller({ onAudienceError: () => {} });
    story.audience.remove("console");
    story.audience.add(createBrokenAudience());

    expect(() => story.tell("no throw")).not.toThrow();
    await expect(tick()).resolves.toBeUndefined();
  });

  it("survives an async audience that rejects", async () => {
    const errors: unknown[] = [];
    const story = new Storyteller({
      onAudienceError: (error) => { errors.push(error); },
    });
    story.audience.remove("console");
    story.audience.add({
      name: "rejects",
      hear: async () => {
        await Promise.resolve();
        throw new Error("rejected later");
      },
    });

    story.tell("async failure");
    await tick();
    await tick();

    expect(errors.length).toBe(1);
    expect((errors[0] as Error).message).toBe("rejected later");
  });

  it("reports the failing audience and the emission", async () => {
    const reports: { name: string; kind: string }[] = [];
    const story = new Storyteller({
      onAudienceError: (_error, member, emission) => {
        reports.push({ name: member.name, kind: emission.kind });
      },
    });
    story.audience.remove("console");
    story.audience.add(createBrokenAudience("db"));

    story.warn("failed write");
    await tick();

    expect(reports).toEqual([{ name: "db", kind: "story" }]);
  });

  it("contains a throwing accepts() and skips that audience", async () => {
    const errors: unknown[] = [];
    const heard: Emission[] = [];
    const story = new Storyteller({
      onAudienceError: (error) => { errors.push(error); },
    });
    story.audience.remove("console");
    story.audience.add({
      name: "picky",
      accepts: () => {
        throw new Error("accepts exploded");
      },
      hear: (e) => { heard.push(e); },
    });

    story.tell("filtered");
    await tick();

    expect(errors.length).toBe(1);
    expect(heard.length).toBe(0);
  });

  it("does not escalate when the error handler itself throws", async () => {
    const story = new Storyteller({
      onAudienceError: () => {
        throw new Error("handler exploded");
      },
    });
    story.audience.remove("console");
    story.audience.add(createBrokenAudience());

    expect(() => story.tell("double failure")).not.toThrow();
    await expect(tick()).resolves.toBeUndefined();
  });

  it("warns on the console when no handler is given, rather than staying silent", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const story = new Storyteller();
    story.audience.remove("console");
    // A unique name keeps this out of the shared throttle window
    story.audience.add(createBrokenAudience(`unreported-${Math.random()}`));

    story.tell("unhandled");
    await tick();

    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0]?.[0])).toContain("failed to hear");

    spy.mockRestore();
  });

  it("throttles repeated warnings for the same audience", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const story = new Storyteller({ narration: "live" });
    story.audience.remove("console");
    story.audience.add(createBrokenAudience(`noisy-${Math.random()}`));

    for (let index = 0; index < 20; index += 1) story.note(`beat ${index}`);
    await tick();

    expect(spy.mock.calls.length).toBe(1);

    spy.mockRestore();
  });
});

describe("back-pressure", () => {
  it("stops growing the queue for an audience that never resolves", async () => {
    let started = 0;
    const story = new Storyteller({
      narration: "live",
      maxInFlight: 10,
      onAudienceError: () => {},
    });
    story.audience.remove("console");
    story.audience.add({
      name: "stuck",
      hears: ["note"],
      hear: () => {
        started += 1;
        // Never resolves, so every delivery stays in flight
        return new Promise<void>(() => {});
      },
    });

    for (let index = 0; index < 5000; index += 1) story.note(`beat ${index}`);

    expect(started).toBe(10);
  });

  it("counts what it dropped on the closing story", async () => {
    const stories: StoryEvent[] = [];
    const story = new Storyteller({
      narration: "live",
      maxInFlight: 5,
      onAudienceError: () => {},
    });
    story.audience.remove("console");
    story.audience.add({
      name: "stuck",
      hears: ["note"],
      hear: () => new Promise<void>(() => {}),
    });
    story.audience.add({
      name: "capture",
      hear: (emission) => { if (emission.kind === "story") stories.push(emission); },
    });

    for (let index = 0; index < 12; index += 1) story.note(`beat ${index}`);
    story.tell("finished under pressure");
    await tick();

    expect(stories[0]!.droppedEmissions).toBe(7);
    // The record still holds every note — only the live emissions were dropped
    expect(stories[0]!.notes.length).toBe(12);
  });

  it("leaves the field off entirely when nothing was dropped", async () => {
    const stories: StoryEvent[] = [];
    const story = new Storyteller({ narration: "live" });
    story.audience.remove("console");
    story.audience.add({
      name: "capture",
      hears: ["note", "story"],
      hear: (emission) => { if (emission.kind === "story") stories.push(emission); },
    });

    story.note("one");
    story.tell("clean");
    await tick();

    expect(stories[0]!.droppedEmissions).toBeUndefined();
    expect("droppedEmissions" in stories[0]!).toBe(false);
  });

  it("frees capacity again once deliveries complete", async () => {
    let heard = 0;
    const story = new Storyteller({ narration: "live", maxInFlight: 2 });
    story.audience.remove("console");
    story.audience.add({
      name: "slow",
      hears: ["note"],
      hear: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        heard += 1;
      },
    });

    story.note("one");
    story.note("two");
    await new Promise((resolve) => setTimeout(resolve, 20));

    story.note("three");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(heard).toBe(3);
  });

  it("resets the dropped count for the next story", async () => {
    const stories: StoryEvent[] = [];
    const story = new Storyteller({
      narration: "live",
      maxInFlight: 1,
      onAudienceError: () => {},
    });
    story.audience.remove("console");
    story.audience.add({
      name: "stuck",
      hears: ["note"],
      hear: () => new Promise<void>(() => {}),
    });
    story.audience.add({
      name: "capture",
      hear: (emission) => { if (emission.kind === "story") stories.push(emission); },
    });

    story.note("a").note("b").note("c");
    story.tell("first");
    await tick();

    story.tell("second");
    await tick();

    expect(stories[0]!.droppedEmissions).toBe(2);
    expect(stories[1]!.droppedEmissions).toBeUndefined();
  });
});
