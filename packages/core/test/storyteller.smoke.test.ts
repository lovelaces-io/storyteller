import { describe, it } from "vitest";
import { Storyteller } from "../src/index.js";

describe("Storyteller smoke", () => {
  it("instantiates and logs", () => {
    const story = new Storyteller({
      origin: { where: { app: "consumer-repo" } },
    });
    story.note("smoke test: dependency installed");
    story.warn("storyteller installed and working");
  });
});
