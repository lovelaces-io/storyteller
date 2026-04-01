import { describe, it, expect } from "vitest";
import type { StoryEventBase } from "../src/storyteller";
import { formatStory } from "../src/formatting";
import { writeStoryReport } from "../src/report/writeStoryReport";

function makeEvent(overrides: Partial<StoryEventBase> = {}): StoryEventBase {
  return {
    timestamp: "2026-03-31T14:30:00.000Z",
    level: "tell",
    title: "Test story",
    notes: [],
    ...overrides,
  };
}

describe("summarizeStory", () => {
  it("returns text and data", () => {
    const result = formatStory(makeEvent(), { colors: false });

    expect(result.text).toContain("Test story");
    expect(result.data.title).toBe("Test story");
    expect(result.data.level).toBe("tell");
  });

  it("includes notes in output", () => {
    const event = makeEvent({
      notes: [
        { timestamp: "2026-03-31T14:30:00.000Z", note: "first note" },
        { timestamp: "2026-03-31T14:30:01.000Z", note: "second note" },
      ],
    });
    const result = formatStory(event, { colors: false });

    expect(result.text).toContain("first note");
    expect(result.text).toContain("second note");
    expect(result.data.notes.length).toBe(2);
  });

  it("sorts notes chronologically", () => {
    const event = makeEvent({
      notes: [
        { timestamp: "2026-03-31T14:30:02.000Z", note: "later" },
        { timestamp: "2026-03-31T14:30:00.000Z", note: "earlier" },
      ],
    });
    const result = formatStory(event, { colors: false });

    expect(result.data.notes[0]!.note).toBe("earlier");
    expect(result.data.notes[1]!.note).toBe("later");
  });

  it("computes duration when multiple notes exist", () => {
    const event = makeEvent({
      notes: [
        { timestamp: "2026-03-31T14:30:00.000Z", note: "start" },
        { timestamp: "2026-03-31T14:30:03.000Z", note: "end" },
      ],
    });
    const result = formatStory(event, { colors: false });

    expect(result.data.durationMs).toBe(3000);
    expect(result.data.duration).toBe("3.0s");
  });

  it("omits duration for single note", () => {
    const event = makeEvent({
      notes: [{ timestamp: "2026-03-31T14:30:00.000Z", note: "only one" }],
    });
    const result = formatStory(event, { colors: false });

    expect(result.data.durationMs).toBeUndefined();
    expect(result.data.duration).toBeUndefined();
  });

  it("omits duration for zero notes", () => {
    const result = formatStory(makeEvent(), { colors: false });
    expect(result.data.durationMs).toBeUndefined();
  });

  it("includes error in output", () => {
    const event = makeEvent({
      level: "oops",
      error: { name: "TypeError", message: "null reference" },
    });
    const result = formatStory(event, { colors: false });

    expect(result.text).toContain("TypeError: null reference");
    expect(result.data.error?.name).toBe("TypeError");
  });

  it("includes origin in output", () => {
    const event = makeEvent({
      origin: { who: "api", where: "checkout" },
    });
    const result = formatStory(event, { colors: false });

    expect(result.text).toContain("checkout");
    expect(result.data.origin?.who).toBe("api");
  });

  it("brief verbosity hides the Notes section but data still has notes", () => {
    const event = makeEvent({
      notes: [{ timestamp: "2026-03-31T14:30:00.000Z", note: "a note" }],
    });
    const result = formatStory(event, { colors: false, detail: "brief" });

    // Brief hides the "Notes:" section header — no indented note lines
    expect(result.text).not.toContain("Notes:");
    // But data still includes the notes for storage/machine use
    expect(result.data.notes.length).toBe(1);
  });

  it("respects maxNotes", () => {
    const notes = Array.from({ length: 10 }, (_, index) => ({
      timestamp: `2026-03-31T14:30:${String(index).padStart(2, "0")}.000Z`,
      note: `note ${index}`,
    }));
    const event = makeEvent({ notes });
    const result = formatStory(event, { colors: false, noteLimit: 3 });

    expect(result.data.notes.length).toBe(3);
    expect(result.text).toContain("7 more");
  });

  it("showData false hides JSON block", () => {
    const result = formatStory(makeEvent(), { colors: false, showData: false });
    expect(result.text).not.toContain("{");
  });
});

describe("writeStoryReport", () => {
  it("returns empty report for no stories", () => {
    const result = writeStoryReport([]);
    expect(result).toContain("no stories");
  });

  it("groups stories by day", () => {
    const stories = [
      makeEvent({ timestamp: "2026-03-31T10:00:00.000Z", title: "Morning" }),
      makeEvent({ timestamp: "2026-03-31T15:00:00.000Z", title: "Afternoon" }),
      makeEvent({ timestamp: "2026-04-01T10:00:00.000Z", title: "Next day" }),
    ];
    const result = writeStoryReport(stories, { colors: false, showData: false });

    expect(result).toContain("Morning");
    expect(result).toContain("Next day");
  });

  it("shows date range in header", () => {
    const stories = [
      makeEvent({ timestamp: "2026-03-31T10:00:00.000Z" }),
      makeEvent({ timestamp: "2026-04-02T10:00:00.000Z" }),
    ];
    const result = writeStoryReport(stories, { colors: false });

    expect(result).toContain("Storyteller Report");
    expect(result).toContain("Range:");
  });

  it("sorts stories chronologically", () => {
    const stories = [
      makeEvent({ timestamp: "2026-04-01T10:00:00.000Z", title: "Second" }),
      makeEvent({ timestamp: "2026-03-31T10:00:00.000Z", title: "First" }),
    ];
    const result = writeStoryReport(stories, { colors: false, showData: false });

    const firstIndex = result.indexOf("First");
    const secondIndex = result.indexOf("Second");
    expect(firstIndex).toBeLessThan(secondIndex);
  });
});
