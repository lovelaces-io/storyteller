import { describe, it, expect } from "vitest";
import type { StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";
import { dbAudience } from "../src/audiences/dbAudience";

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

    // Delivery is microtask-scheduled, so wait one tick
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(savedEvents.length).toBe(1);
    expect(savedEvents[0]!.notes.length).toBe(2);

    story.tell("second");
    await new Promise((resolve) => setTimeout(resolve, 0));

    // "tell" events are filtered out by dbAudience, so count stays at 1
    expect(savedEvents.length).toBe(1);
  });
});
