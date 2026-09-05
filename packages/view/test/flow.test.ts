import { describe, expect, it } from "vitest";
import { renderStoryFlow } from "../src/flow";
import type { StoryRecord } from "../src/types";

const at = (ms: number) => new Date(Date.UTC(2026, 8, 5, 12, 0, 0, ms)).toISOString();

const root: StoryRecord = { storyId: "root", timestamp: at(31000), level: "Error", title: "Nightly sync failed", origin: { who: "sync-agent" }, durationMs: 31000, notes: [
  { timestamp: at(0), sequence: 0, note: "Fetched 1,200 rows", what: { source: "crm", rows: 1200 } },
  { timestamp: at(4000), sequence: 1, note: "Batch 1 of 3 upserted" },
  { timestamp: at(21000), sequence: 2, note: "Retrying batch 3", level: "Warning" },
  { timestamp: at(31000), sequence: 3, note: "Upsert failed", level: "Error", error: { name: "DeadlockError", message: "deadlock detected", stack: "DeadlockError: deadlock detected\n    at upsert (sync.ts:88:11)" } },
], error: { name: "DeadlockError", message: "deadlock detected", stack: "DeadlockError: deadlock detected\n    at upsert (sync.ts:88:11)" } };
const chapters: StoryRecord[] = [
  { storyId: "schema", timestamp: at(3000), level: "Information", title: "Schema checked", parentStoryId: "root", origin: { what: "schema" }, durationMs: 2500, notes: [{ timestamp: at(500), sequence: 0, note: "42 columns match" }] },
  { storyId: "retry", timestamp: at(31000), level: "Warning", title: "Batch 3 retried twice", parentStoryId: "root", durationMs: 10000, notes: [{ timestamp: at(21000), sequence: 0, note: "Attempt 1 timed out", level: "Warning" }, { timestamp: at(27000), sequence: 1, note: "Attempt 2 timed out", level: "Warning" }] },
  { storyId: "unrelated", timestamp: at(5000), level: "Information", title: "Something else", notes: [] },
];

describe("renderStoryFlow", () => {
  const flow = renderStoryFlow(root, { chapters });
  const steps = [...flow.querySelectorAll(":scope > .stv-flow-steps > .stv-step")];
  const text = (step: Element) => step.querySelector(":scope > .stv-step-body > .stv-step-title")!.textContent;

  it("lays the story out as numbered steps in the order they happened, chapters included, ending with the outcome", () => {
    expect(flow.querySelector(".stv-flow-title")!.textContent).toBe("Nightly sync failed");
    expect(flow.querySelector(".stv-flow-status")!.textContent).toBe("failed");
    expect(steps.map((step) => step.getAttribute("data-kind"))).toEqual(["beat", "chapter", "beat", "beat", "chapter", "beat", null]);
    expect(steps.slice(0, 6).map((step) => step.querySelector(".stv-step-number")!.textContent)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(steps.map(text)).toEqual([
      "Fetched 1,200 rowsstart",
      "Schema checkedchapter+500 ms",
      "Batch 1 of 3 upserted+4.00 s",
      "Retrying batch 3+21.0 s",
      "Batch 3 retried twicechapter+21.0 s",
      "Upsert failed+31.0 s",
      "failed: deadlock detected",
    ]);
    expect(flow.querySelector('.stv-flow[data-story-id="unrelated"]')).toBeNull();
  });

  it("colours every step by how it went and marks where things turned", () => {
    expect(steps.map((step) => step.getAttribute("data-level"))).toEqual(["Information", "Information", "Information", "Warning", "Warning", "Error", "Error"]);
    expect(steps.map((step) => step.getAttribute("data-turn"))).toEqual([null, null, null, null, null, "true", null]);
    expect(steps[6]!.classList.contains("stv-step-end")).toBe(true);
    expect(steps[6]!.querySelector(".stv-step-number")!.textContent).toBe("✕");
    const fine = renderStoryFlow(chapters[0]!);
    const fineSteps = [...fine.querySelectorAll(".stv-step")];
    expect(fineSteps.map((s) => s.getAttribute("data-turn"))).toEqual([null, null]);
    expect(fineSteps[1]!.querySelector(".stv-step-number")!.textContent).toBe("✓");
    expect(fineSteps[1]!.querySelector(".stv-step-outcome")!.textContent).toBe("finished");
  });

  it("nests a chapter's own steps inside its step, arrows and all", () => {
    const retry = steps[4]!;
    const inner = retry.querySelector(":scope > .stv-step-body > .stv-flow") as HTMLElement;
    expect(inner.dataset["depth"]).toBe("1");
    expect(inner.dataset["storyId"]).toBe("retry");
    expect([...inner.querySelectorAll(":scope > .stv-flow-steps > .stv-step")].map((s) => s.querySelector(".stv-step-title")!.textContent)).toEqual(["Attempt 1 timed outstart", "Attempt 2 timed out+6.00 s", "finished with warnings"]);
  });

  it("unfolds a step to its logs and data, and the end to the error, closed unless asked", () => {
    const first = steps[0]!;
    const unfold = first.querySelector("details.stv-step-unfold") as HTMLDetailsElement;
    expect(unfold.open).toBe(false);
    expect(unfold.querySelector("summary")!.textContent).toBe("logs and data");
    expect(unfold.querySelector(".stv-step-context .stv-key")!.textContent).toBe("what");
    expect(unfold.textContent).toContain("1200");
    expect(steps[2]!.querySelector("details")).toBeNull();
    expect(steps[5]!.querySelector(".stv-step-reason")!.textContent).toBe("deadlock detected");
    expect(steps[5]!.querySelector(".stv-step-detail .stv-error .stv-pre")!.textContent).toContain("sync.ts:88:11");
    expect(steps[6]!.querySelector("details summary")!.textContent).toBe("the error");

    const failedOpen = renderStoryFlow(root, { chapters, unfold: "failed" });
    const opened = [...failedOpen.querySelectorAll(":scope > .stv-flow-steps > .stv-step > .stv-step-body > details")].map((d) => (d as HTMLDetailsElement).open);
    expect(opened).toEqual([false, true, true]);
    const allOpen = renderStoryFlow(root, { unfold: "all" });
    expect([...allOpen.querySelectorAll("details.stv-step-unfold")].every((d) => (d as HTMLDetailsElement).open)).toBe(true);
  });

  it("never turns content into markup", () => {
    const hostile = renderStoryFlow({ storyId: "h", timestamp: at(0), level: "Error", title: "<b>t</b>", notes: [{ timestamp: at(0), note: "<script>1</script>", what: { x: "<img src=x>" }, error: { message: "<i>e</i>" } }], error: { message: "<u>x</u>", stack: "<script>y</script>" } }, { unfold: "all" });
    expect(hostile.querySelector("b, script, img, i, u")).toBeNull();
    expect(hostile.querySelector(".stv-flow-title")!.textContent).toBe("<b>t</b>");
  });
});
