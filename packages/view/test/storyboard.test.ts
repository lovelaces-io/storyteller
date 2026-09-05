import { describe, expect, it } from "vitest";
import { renderStoryboard } from "../src/storyboard";
import type { StoryRecord } from "../src/types";

const at = (ms: number) => new Date(Date.UTC(2026, 8, 5, 12, 0, 0, ms)).toISOString();

const run: StoryRecord[] = [
  { storyId: "root", timestamp: at(31000), level: "Error", title: "Nightly sync failed", origin: { who: "sync-agent" }, durationMs: 31000, notes: [
    { timestamp: at(0), sequence: 0, note: "Fetched 1,200 rows", what: { source: "crm", rows: 1200 } },
    { timestamp: at(4000), sequence: 1, note: "Batch 1 of 3 upserted" },
    { timestamp: at(21000), sequence: 2, note: "Retrying batch 3", level: "Warning" },
    { timestamp: at(31000), sequence: 3, note: "Upsert failed", level: "Error", error: { name: "DeadlockError", message: "deadlock detected", stack: "DeadlockError: deadlock detected\n    at upsert (sync.ts:88:11)" } },
  ], error: { name: "DeadlockError", message: "deadlock detected", stack: "DeadlockError: deadlock detected\n    at upsert (sync.ts:88:11)" } },
  { storyId: "schema", timestamp: at(3000), level: "Information", title: "Schema checked", parentStoryId: "root", origin: { what: "schema" }, durationMs: 2500, notes: [{ timestamp: at(500), sequence: 0, note: "42 columns match" }] },
  { storyId: "retry", timestamp: at(31000), level: "Warning", title: "Batch 3 retried twice", parentStoryId: "root", durationMs: 10000, notes: [{ timestamp: at(21000), sequence: 0, note: "Attempt 1 timed out", level: "Warning" }] },
  { storyId: "digest", timestamp: at(45000), level: "Information", title: "Digest sent", origin: { who: "mailer" }, durationMs: 1900, notes: [{ timestamp: at(43100), sequence: 0, note: "Digest built" }, { timestamp: at(45000), sequence: 1, note: "Digest sent" }] },
];

describe("renderStoryboard", () => {
  const board = renderStoryboard(run);
  const panels = [...board.querySelectorAll(".stv-panel")];

  it("opens with a one-line summary that says whether anything failed", () => {
    expect(board.querySelector(".stv-board-summary")!.textContent).toBe("4 stories · 1 failed · 1 with warnings");
    expect(board.querySelector(".stv-board-head")!.getAttribute("data-state")).toBe("failed");
    const fine = renderStoryboard([run[3]!]);
    expect(fine.querySelector(".stv-board-summary")!.textContent).toBe("1 story · all fine");
    expect(fine.querySelector(".stv-board-head")!.getAttribute("data-state")).toBe("fine");
  });

  it("gives every story a panel, roots in reading order, chapters nested under the beat that started them", () => {
    expect(panels.map((panel) => panel.getAttribute("data-story-id"))).toEqual(["root", "schema", "retry", "digest"]);
    const items = [...board.querySelectorAll(".stv-board-strip > .stv-board-item")];
    expect(items.map((item) => item.querySelector(".stv-panel")!.getAttribute("data-story-id"))).toEqual(["root", "digest"]);
    const rootBeats = [...board.querySelector('.stv-panel[data-story-id="root"] > .stv-panel-beats')!.children];
    const label = (li: Element) => li.classList.contains("stv-panel-chapter") ? li.querySelector(".stv-panel-title")!.textContent : li.querySelector(".stv-panel-text")!.textContent;
    expect(rootBeats.map((li) => li.classList[0] + ":" + label(li))).toEqual([
      "stv-panel-beat:Fetched 1,200 rows",
      "stv-panel-chapter:Schema checked",
      "stv-panel-beat:Batch 1 of 3 upserted",
      "stv-panel-beat:Retrying batch 3",
      "stv-panel-chapter:Batch 3 retried twice",
      "stv-panel-beat:Upsert failed",
    ]);
  });

  it("reads as sentences with a small 'when', and says how each story ended", () => {
    const root = board.querySelector('.stv-panel[data-story-id="root"]')!;
    expect([...root.querySelectorAll(":scope > .stv-panel-beats > .stv-panel-beat .stv-panel-when")].map((n) => n.textContent)).toEqual(["start", "+4.00 s", "+21.0 s", "+31.0 s"]);
    expect(root.querySelector(':scope > .stv-panel-beats > .stv-panel-beat[data-level="Error"] .stv-panel-reason')!.textContent).toBe("deadlock detected");
    expect(root.querySelector(":scope > .stv-panel-foot .stv-panel-outcome")!.textContent).toBe("deadlock detected");
    expect(root.querySelector(":scope > .stv-panel-foot .stv-panel-meta")!.textContent).toBe("sync-agent · 31.0 s");
    expect(root.querySelector(":scope > .stv-panel-head .stv-panel-level")!.textContent).toBe("failed");
    const digest = board.querySelector('.stv-panel[data-story-id="digest"]')!;
    expect(digest.querySelector(".stv-panel-outcome")!.textContent).toBe("finished");
    expect(digest.querySelector(".stv-panel-level")!.textContent).toBe("ok");
  });

  it("unfolds a beat with data or an error to the raw detail, and the story's error to its stack", () => {
    const root = board.querySelector('.stv-panel[data-story-id="root"]')!;
    const first = root.querySelector(':scope > .stv-panel-beats > .stv-panel-beat') as HTMLElement;
    expect(first.classList.contains("stv-panel-beat-detailed")).toBe(true);
    const unfold = first.querySelector("details.stv-panel-unfold") as HTMLDetailsElement;
    expect(unfold.open).toBe(false);
    expect(unfold.querySelector("summary .stv-panel-text")!.textContent).toBe("Fetched 1,200 rows");
    expect(unfold.querySelector(".stv-panel-detail .stv-key")!.textContent).toBe("what");
    expect(unfold.querySelector(".stv-panel-detail .stv-tree")).not.toBeNull();
    expect(unfold.querySelector(".stv-panel-detail")!.textContent).toContain("1200");
    const plain = root.querySelectorAll(":scope > .stv-panel-beats > .stv-panel-beat")[1]!;
    expect(plain.querySelector("details")).toBeNull();
    const failedBeat = root.querySelector(':scope > .stv-panel-beats > .stv-panel-beat[data-level="Error"]')!;
    expect(failedBeat.querySelector(".stv-panel-detail .stv-error .stv-pre")!.textContent).toContain("sync.ts:88:11");
    expect(root.querySelector(":scope > .stv-panel-foot .stv-panel-raw .stv-error-name")!.textContent).toBe("DeadlockError");
  });

  it("labels the gap between panels with how much later the next began", () => {
    expect([...board.querySelectorAll(".stv-board-gap-label")].map((n) => n.textContent)).toEqual(["12.1 s later"]);
    const overlapping = renderStoryboard([run[3]!, { ...run[3]!, storyId: "again", timestamp: at(44000), notes: [{ timestamp: at(43000), note: "x" }] }]);
    expect(overlapping.querySelector(".stv-board-gap-label")!.textContent).toBe("meanwhile");
  });

  it("folds long panels behind 'n more beats' and keeps later chapters reachable", () => {
    const long: StoryRecord = { storyId: "long", timestamp: at(9000), level: "Information", title: "Long", notes: Array.from({ length: 9 }, (_, i) => ({ timestamp: at(i * 1000), sequence: i, note: `beat ${i}` })) };
    const chapter: StoryRecord = { storyId: "late", timestamp: at(8500), level: "Information", title: "Late chapter", parentStoryId: "long", notes: [{ timestamp: at(8100), note: "y" }] };
    const folded = renderStoryboard([long, chapter], { maxBeats: 3 });
    expect(folded.querySelectorAll('.stv-panel[data-story-id="long"] > .stv-panel-beats > .stv-panel-beat').length).toBe(3);
    expect(folded.querySelector(".stv-panel-more")!.textContent).toBe("6 more beats");
    expect(folded.querySelector('.stv-panel[data-story-id="late"]')).not.toBeNull();
  });

  it("offers an open button per panel when asked, and a chapter's opens the chapter", () => {
    const opened: string[] = [];
    const live = renderStoryboard(run, { onSelect: (story) => opened.push(story.title) });
    const buttons = [...live.querySelectorAll(".stv-panel-open")] as HTMLButtonElement[];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Open Nightly sync failed", "Open Schema checked", "Open Batch 3 retried twice", "Open Digest sent"]);
    buttons[1]!.click();
    buttons[0]!.click();
    expect(opened).toEqual(["Schema checked", "Nightly sync failed"]);
    expect(board.querySelector(".stv-panel-open")).toBeNull();
  });

  it("marks an orphaned chapter and never turns content into markup", () => {
    const hostile = renderStoryboard([{ storyId: "h", timestamp: at(0), level: "Error", title: "<img src=x onerror=alert(1)>", parentStoryId: "missing", origin: { who: "<b>x</b>" }, notes: [{ timestamp: at(0), note: "<script>1</script>", what: { html: "<iframe>" }, error: { message: "<i>e</i>" } }] }]);
    expect(hostile.querySelector("img, script, b, i, iframe")).toBeNull();
    expect(hostile.querySelector(".stv-panel-title")!.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(hostile.querySelector(".stv-panel")!.getAttribute("data-orphan")).toBe("true");
    expect(hostile.querySelector(".stv-panel-meta")!.textContent).toContain("parent not shown");
  });

  it("says so when there is nothing", () => {
    const empty = renderStoryboard([]);
    expect(empty.querySelector(".stv-board-summary")!.textContent).toBe("0 stories");
    expect(empty.querySelector(".stv-board-empty")!.textContent).toBe("Nothing to show yet.");
  });
});
