/**
 * Output snapshot tests — captures the exact shape of what Storyteller produces.
 *
 * Two modes:
 *   1. The Story (JSON record) — what gets stored in a DB row
 *   2. The Report (formatted text) — what gets printed to console or file
 *
 * Every field in the output must justify its existence.
 * Run these tests to see exactly what consumers receive today.
 */

import { describe, it, expect } from "vitest";
import type { StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";
import { formatStory } from "../src/formatting";
import { writeStoryReport } from "../src/report/writeStoryReport";

/** Capture the exact event that an audience receives */
function captureStory(setup: (story: Storyteller) => void): Promise<StoryEvent> {
  return new Promise((resolve) => {
    const story = new Storyteller({
      origin: { who: "payment-service", where: { app: "web", page: "checkout" } },
    });
    // Remove default console audience so output is clean
    story.audience.remove("console");
    story.audience.add({
      name: "capture",
      hear: (event) => resolve(event),
    });
    setup(story);
  });
}

describe("Story record (what gets stored)", () => {
  it("baseline: tell with notes", async () => {
    const event = await captureStory((story) => {
      story.note("User clicked checkout");
      story.note("Cart validated", { what: { items: 3 } });
      story.note("Redirecting to payment");
      story.tell("Checkout started");
    });

    // Capture the exact JSON shape
    const record = JSON.parse(JSON.stringify(event));

    console.log("\n=== STORY RECORD (tell with notes) ===");
    console.log(JSON.stringify(record, null, 2));
    console.log("=== END ===\n");

    // Structure assertions
    expect(record.timestamp).toBeDefined();
    expect(record.level).toBe("Information");
    expect(record.title).toBe("Checkout started");
    expect(record.origin).toEqual({
      who: "payment-service",
      where: { app: "web", page: "checkout" },
    });
    expect(record.notes).toHaveLength(3);
    expect(record.error).toBeUndefined();

    // Note structure
    const note = record.notes[1];
    expect(note.timestamp).toBeDefined();
    expect(note.note).toBe("Cart validated");
    expect(note.what).toEqual({ items: 3 });

    // durationMs is computed from first→last note and included in the record
    // (0 here because notes are added synchronously in the same tick)
    expect(record.durationMs).toBeDefined();

    // Should NOT have these presentation fields
    expect(record.summarize).toBeUndefined(); // non-enumerable, good
    expect(record.when).toBeUndefined(); // no formatted timestamps on the raw record
  });

  it("baseline: oops with error", async () => {
    const event = await captureStory((story) => {
      story.note("Attempted charge", { what: { amount: "$42.00" } });
      story.note("Card declined", {
        error: new Error("Insufficient funds"),
        where: "stripe-api",
      });
      story.oops("Payment failed", new Error("Checkout error"));
    });

    const record = JSON.parse(JSON.stringify(event));

    console.log("\n=== STORY RECORD (oops with error) ===");
    console.log(JSON.stringify(record, null, 2));
    console.log("=== END ===\n");

    expect(record.level).toBe("Error");
    expect(record.error).toBeDefined();
    expect(record.error.name).toBe("Error");
    expect(record.error.message).toBe("Checkout error");
    expect(record.error.stack).toBeDefined();

    // Note-level error
    const declinedNote = record.notes[1];
    expect(declinedNote.error.message).toBe("Insufficient funds");
  });

  it("baseline: warn with no origin", async () => {
    const event = await new Promise<StoryEvent>((resolve) => {
      const story = new Storyteller(); // no origin
      story.audience.remove("console");
      story.audience.add({ name: "capture", hear: (e) => resolve(e) });
      story.note("Response slow", { what: { latencyMs: 2500 } });
      story.warn("Slow API response");
    });

    const record = JSON.parse(JSON.stringify(event));

    console.log("\n=== STORY RECORD (warn, no origin) ===");
    console.log(JSON.stringify(record, null, 2));
    console.log("=== END ===\n");

    expect(record.origin).toBeUndefined();
    expect(record.level).toBe("Warning");
  });

  it("baseline: minimal tell (no notes, no origin)", async () => {
    const event = await new Promise<StoryEvent>((resolve) => {
      const story = new Storyteller();
      story.audience.remove("console");
      story.audience.add({ name: "capture", hear: (e) => resolve(e) });
      story.tell("App started");
    });

    const record = JSON.parse(JSON.stringify(event));

    console.log("\n=== STORY RECORD (minimal) ===");
    console.log(JSON.stringify(record, null, 2));
    console.log("=== END ===\n");

    // The absolute minimum shape
    expect(Object.keys(record).sort()).toEqual(["level", "notes", "timestamp", "title"]);
    expect(record.level).toBe("Information");
    expect(record.notes).toEqual([]);
  });
});

describe("Report output (what gets printed)", () => {
  it("baseline: single story report", () => {
    const report = formatStory(
      {
        timestamp: "2026-03-31T14:30:00.000Z",
        level: "Warning",
        title: "Payment retry succeeded on second attempt",
        origin: { who: "payment-service", where: { app: "web", page: "checkout" } },
        notes: [
          { timestamp: "2026-03-31T14:30:00.000Z", note: "Card declined by processor" },
          { timestamp: "2026-03-31T14:30:02.000Z", note: "Retrying with backup processor" },
          { timestamp: "2026-03-31T14:30:03.420Z", note: "Payment approved", what: { amount: "$42.00" } },
        ],
        error: { name: "CardDeclinedError", message: "Insufficient funds" },
      },
      { colors: false, timezone: "America/New_York" }
    );

    console.log("\n=== REPORT (single story, no colors) ===");
    console.log(report.text);
    console.log("=== END ===\n");

    // Text contains the key sections
    expect(report.text).toContain("Story: Payment retry");
    expect(report.text).toContain("Level: Warning");
    expect(report.text).toContain("Time:");
    expect(report.text).toContain("Origin:");
    expect(report.text).toContain("Error: CardDeclinedError");
    expect(report.text).toContain("Notes:");
    expect(report.text).toContain("Card declined");
    expect(report.text).toContain("Data:");

    // Data object structure
    console.log("\n=== REPORT DATA (structured) ===");
    console.log(JSON.stringify(report.data, null, 2));
    console.log("=== END ===\n");

    expect(report.data.durationMs).toBe(3420);
    expect(report.data.duration).toBe("3.4s");
    expect(report.data.notes).toHaveLength(3);

    // Note: each summary note has BOTH 'note' (raw) and 'text' (formatted)
    const summaryNote = report.data.notes[0]!;
    expect(summaryNote.note).toBeDefined();
    expect(summaryNote.text).toBeDefined();
    expect(summaryNote.timestamp).toBeDefined();
    expect(summaryNote.when).toBeDefined();
  });

  it("baseline: multi-story report", () => {
    const stories = [
      {
        timestamp: "2026-03-31T10:00:00.000Z",
        level: "Information" as const,
        title: "User logged in",
        notes: [{ timestamp: "2026-03-31T10:00:00.000Z", note: "OAuth flow completed" }],
      },
      {
        timestamp: "2026-03-31T10:05:00.000Z",
        level: "Warning" as const,
        title: "Slow query detected",
        notes: [
          { timestamp: "2026-03-31T10:05:00.000Z", note: "Query started" },
          { timestamp: "2026-03-31T10:05:02.500Z", note: "Query completed" },
        ],
      },
      {
        timestamp: "2026-03-31T15:30:00.000Z",
        level: "Error" as const,
        title: "Background job failed",
        notes: [],
        error: { name: "TimeoutError", message: "Job exceeded 30s limit" },
      },
    ];

    const report = writeStoryReport(stories, {
      colors: false,
      showData: false,
      timezone: "America/New_York",
    });

    console.log("\n=== MULTI-STORY REPORT (no data, no colors) ===");
    console.log(report);
    console.log("=== END ===\n");

    expect(report).toContain("Storyteller Report");
    expect(report).toContain("Range:");
    expect(report).toContain("User logged in");
    expect(report).toContain("Slow query detected");
    expect(report).toContain("Background job failed");
  });
});
