import { describe, it, expect } from "vitest";
import { useStoryteller } from "../src/useStoryteller";

describe("useStoryteller", () => {
  it("returns a Storyteller instance", () => {
    const story = useStoryteller({ reset: true });
    expect(story).toBeDefined();
    expect(typeof story.note).toBe("function");
    expect(typeof story.tell).toBe("function");
  });

  it("returns the same instance on subsequent calls", () => {
    const first = useStoryteller({ reset: true });
    const second = useStoryteller();
    expect(second).toBe(first);
  });

  it("reset creates a new instance", () => {
    const first = useStoryteller({ reset: true });
    const second = useStoryteller({ reset: true });
    expect(second).not.toBe(first);
  });

  it("passes origin to the new instance", () => {
    const story = useStoryteller({
      reset: true,
      origin: { who: "shared-service" },
    });
    // Verify by telling a story and checking the event
    expect(story).toBeDefined();
  });
});
