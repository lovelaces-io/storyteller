// @vitest-environment node
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderStory } from "../src/index";
import type { StoryRecord } from "../src/types";
import loreErrorJson from "./fixtures/lore-error.json";

// JSON imports widen "Error" to string; the record is what the file says it is
const loreError = loreErrorJson as StoryRecord;

describe("outside a browser", () => {
  it("explains what to do when there is no document", () => {
    expect(() => renderStory(loreError)).toThrow(/Pass \{ document \}/);
  });

  it("renders into a supplied document", () => {
    const { document } = new JSDOM("<!doctype html><body></body>").window;
    const view = renderStory(loreError, { document });
    expect(view.ownerDocument).toBe(document);
    expect(view.querySelector(".stv-title")!.textContent).toBe("The app shell crashed");
  });
});
