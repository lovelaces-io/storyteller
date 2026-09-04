// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NoteEmission, StoryEvent } from "@lovelaces-io/storyteller";
import type { JsonValue, NoteRecord, StoryRecord } from "../src/types";
import { buildFixtures, type Fixtures } from "./fixtures/stories";
import loreErrorJson from "./fixtures/lore-error.json";

// JSON imports widen "Error" to string; the record is what the file says it is
const loreError = loreErrorJson as StoryRecord;

let fixtures: Fixtures;
const main = () => fixtures.stories["Order ord_9f2 failed"]!;

function walk(value: JsonValue | undefined, visit: (value: JsonValue, path: string) => void, path = "$"): void {
  if (value === undefined) return;
  visit(value, path);
  if (Array.isArray(value)) value.forEach((item, i) => walk(item, visit, `${path}[${i}]`));
  else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) walk(child, visit, `${path}.${key}`);
  }
}

function collectMarkers(story: StoryEvent) {
  const types = new Set<string>();
  const truncations = new Set<string>();
  const circulars: string[] = [];
  const redacted: string[] = [];
  const stringCuts: string[] = [];
  const contexts = story.notes.flatMap((note) => [note.who, note.what, note.where]);
  for (const context of contexts) {
    walk(context, (value, path) => {
      if (typeof value === "string") {
        if (value.startsWith("[Circular → ")) circulars.push(path);
        if (value === "[redacted]") redacted.push(path);
        if (/…\[\+\d+ chars\]$/.test(value)) stringCuts.push(path);
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        if (typeof value["@type"] === "string") types.add(value["@type"]);
        const marker = value["@truncated"];
        if (typeof marker === "object" && marker !== null && !Array.isArray(marker) && typeof marker["kind"] === "string") {
          truncations.add(marker["kind"]);
        }
      }
    });
  }
  return { types, truncations, circulars, redacted, stringCuts };
}

describe("the view's input contract matches what the library emits", () => {
  it("builds the fixtures", async () => {
    fixtures = await buildFixtures();
    expect(Object.keys(fixtures.stories).sort()).toEqual([
      "Inventory reserved",
      "Nightly digest sent",
      "Order ord_9f2 failed",
      "Sync finished with skips",
    ]);
  });

  it("accepts a StoryEvent and a NoteEmission as-is (compile-time check)", () => {
    const story: StoryRecord = main();
    const note: NoteRecord = fixtures.notes[0]!;
    const emission: NoteEmission = fixtures.notes[0]!;
    expect(story.title).toBe("Order ord_9f2 failed");
    expect(note.note).toBe(emission.note);
  });

  it("accepts a story after a JSON round trip, with no functions left", () => {
    const stored = JSON.parse(JSON.stringify(main())) as StoryRecord;
    expect(stored.notes.length).toBe(main().notes.length);
    expect("summarize" in stored).toBe(false);
    const record: StoryRecord = loreError;
    expect(record.notes[0]!.what).toMatchObject({ errorMessage: "preview" });
  });

  it("covers every level", () => {
    expect(fixtures.stories["Order ord_9f2 failed"]!.level).toBe("Error");
    expect(fixtures.stories["Sync finished with skips"]!.level).toBe("Warning");
    expect(fixtures.stories["Nightly digest sent"]!.level).toBe("Information");
    const levels = new Set(main().notes.map((note) => note.level ?? "Information"));
    expect([...levels].sort()).toEqual(["Error", "Information", "Warning"]);
  });

  it("carries @type tags for values JSON cannot hold", () => {
    const { types } = collectMarkers(main());
    for (const expected of ["Map", "Set", "Uint8Array"]) {
      expect([...types], `missing @type ${expected}`).toContain(expected);
    }
  });

  it("carries every kind of truncation marker", () => {
    const { truncations, stringCuts } = collectMarkers(main());
    for (const kind of ["array", "properties", "depth", "bytes"]) {
      expect(truncations, `missing @truncated kind ${kind}`).toContain(kind);
    }
    expect(stringCuts.length).toBeGreaterThan(0);
  });

  it("marks circular references with the path they point back to", () => {
    const { circulars } = collectMarkers(main());
    expect(circulars.length).toBeGreaterThanOrEqual(2);
  });

  it("redacts secret-shaped keys", () => {
    const { redacted } = collectMarkers(main());
    expect(redacted.some((path) => path.endsWith(".password"))).toBe(true);
    expect(redacted.some((path) => path.endsWith(".apiKey"))).toBe(true);
  });

  it("caps the cause chain and marks where it stopped", () => {
    const note = main().notes.find((n) => n.note === "Charge failed")!;
    let depth = 0;
    let cursor: JsonValue | undefined = note.error!.cause;
    while (cursor && typeof cursor === "object" && !Array.isArray(cursor) && typeof cursor["message"] === "string") {
      depth++;
      cursor = cursor["cause"];
    }
    expect(depth).toBe(5);
    expect(cursor).toEqual({ "@truncated": { kind: "causeChain" } });
  });

  it("keeps AggregateError members", () => {
    const note = main().notes.find((n) => n.note === "Several things failed")!;
    expect(note.error!.errors!.map((e) => e.message)).toEqual(["first", "second"]);
  });

  it("links a chapter to its parent", () => {
    expect(fixtures.stories["Inventory reserved"]!.parentStoryId).toBe(fixtures.mainStoryId);
    expect(main().storyId).toBe(fixtures.mainStoryId);
  });

  it("emits notes whose sequence replays the story exactly", () => {
    const live = fixtures.notes
      .filter((note) => note.storyId === fixtures.mainStoryId)
      .sort((a, b) => a.sequence - b.sequence);
    expect(live.map((note) => note.sequence)).toEqual(live.map((_, i) => i));
    expect(live.map((note) => note.note)).toEqual(main().notes.map((note) => note.note));
  });
});
