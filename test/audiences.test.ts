import { describe, it, expect, vi } from "vitest";
import type { StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";
import { consoleAudience } from "../src/audiences/consoleAudience";
import { dbAudience } from "../src/audiences/dbAudience";

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("dbAudience", () => {
  it("accepts warn events", async () => {
    const events: StoryEvent[] = [];
    const story = new Storyteller();
    story.audience.add(dbAudience(async (e) => { events.push(e); }));

    story.warn("a warning");
    await tick();

    expect(events.length).toBe(1);
    expect(events[0]!.level).toBe("warn");
  });

  it("accepts oops events", async () => {
    const events: StoryEvent[] = [];
    const story = new Storyteller();
    story.audience.add(dbAudience(async (e) => { events.push(e); }));

    story.oops("an error");
    await tick();

    expect(events.length).toBe(1);
    expect(events[0]!.level).toBe("oops");
  });

  it("rejects tell events", async () => {
    const events: StoryEvent[] = [];
    const story = new Storyteller();
    story.audience.add(dbAudience(async (e) => { events.push(e); }));

    story.tell("success");
    await tick();

    expect(events.length).toBe(0);
  });

  it("supports synchronous insert functions", async () => {
    const events: StoryEvent[] = [];
    const story = new Storyteller();
    story.audience.add(dbAudience((e) => { events.push(e); }));

    story.warn("sync insert");
    await tick();

    expect(events.length).toBe(1);
  });
});

describe("consoleAudience", () => {
  it("has name 'console'", () => {
    const audience = consoleAudience();
    expect(audience.name).toBe("console");
  });

  it("calls console.log for tell events", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const endSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const story = new Storyteller();
    // consoleAudience is added by default
    story.tell("log test");
    await tick();

    expect(spy).toHaveBeenCalled();
    const callArgs = spy.mock.calls[0];
    expect(callArgs?.[0]).toContain("log test");

    spy.mockRestore();
    groupSpy.mockRestore();
    endSpy.mockRestore();
  });

  it("calls console.warn for warn events", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const endSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const story = new Storyteller();
    story.warn("warn test");
    await tick();

    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
    groupSpy.mockRestore();
    endSpy.mockRestore();
  });

  it("calls console.error for oops events", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const endSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const story = new Storyteller();
    story.oops("error test");
    await tick();

    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
    groupSpy.mockRestore();
    endSpy.mockRestore();
  });

  it("does not include ANSI escape codes in payload", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const endSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const story = new Storyteller();
    story.oops("ansi test");
    await tick();

    const payload = spy.mock.calls[0]?.[1] as string;
    expect(payload).not.toContain("\x1b[");

    spy.mockRestore();
    groupSpy.mockRestore();
    endSpy.mockRestore();
  });
});
