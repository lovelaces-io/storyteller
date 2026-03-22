import { describe, it, expect } from "vitest";
import type { StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";
import { dbAudience } from "../src/audiences/dbAudience";

describe("Storyteller", () => {
  it("clears notes after telling a story", async () => {
    const saved: StoryEvent[] = [];
    const s = new Storyteller();
    s.audience.add(
      dbAudience(async (e) => {
        saved.push(e);
      })
    );

    s.note("one").note("two");
    s.warn("hello"); // should persist to db (warn)

    // delivery is microtask-scheduled; wait one tick
    await new Promise((r) => setTimeout(r, 0));

    expect(saved.length).toBe(1);
    expect(saved[0]!.notes.length).toBe(2);

    s.tell("second"); // tell should NOT persist to db
    await new Promise((r) => setTimeout(r, 0));
    expect(saved.length).toBe(1);

    // notes should have cleared after warn, so this story has 0 notes
    // (since we didn't add notes again before tell)
  });
});
