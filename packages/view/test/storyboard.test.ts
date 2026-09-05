import { describe, expect, it } from "vitest";
import { createStoryboard, formatAgo, renderStoryboard } from "../src/storyboard";
import type { StoryRecord } from "../src/types";

const at = (ms: number) => new Date(Date.UTC(2026, 8, 5, 12, 0, 0, ms)).toISOString();
const NOW = () => new Date(Date.UTC(2026, 8, 5, 12, 2, 0, 0));

const run: StoryRecord[] = [
  { storyId: "root", timestamp: at(31000), level: "Error", title: "Nightly sync failed", origin: { who: "sync-agent" }, durationMs: 31000, notes: [
    { timestamp: at(0), sequence: 0, note: "Fetched 1,200 rows", what: { source: "crm", rows: 1200 } },
    { timestamp: at(4000), sequence: 1, note: "Batch 1 of 3 upserted" },
    { timestamp: at(21000), sequence: 2, note: "Retrying batch 3", level: "Warning" },
    { timestamp: at(31000), sequence: 3, note: "Upsert failed", level: "Error", error: { name: "DeadlockError", message: "deadlock detected", stack: "DeadlockError: deadlock detected\n    at upsert (sync.ts:88:11)" } },
  ], error: { name: "DeadlockError", message: "deadlock detected" } },
  { storyId: "schema", timestamp: at(3000), level: "Information", title: "Schema checked", parentStoryId: "root", origin: { what: "schema" }, durationMs: 2500, notes: [{ timestamp: at(500), sequence: 0, note: "42 columns match" }] },
  { storyId: "digest", timestamp: at(45000), level: "Information", title: "Digest sent", origin: { who: "mailer" }, durationMs: 1900, notes: [{ timestamp: at(43100), sequence: 0, note: "Digest built" }, { timestamp: at(45000), sequence: 1, note: "Digest sent" }] },
  { storyId: "warn", timestamp: at(50000), level: "Warning", title: "Cache warmed slowly", origin: { who: "api" }, durationMs: 6000, notes: [{ timestamp: at(44000), note: "12 keys", level: "Warning" }] },
  { storyId: "live", timestamp: at(60000), level: "Information", title: "Deploy api@2.14", origin: { who: "deploy-bot" }, running: true, notes: [{ timestamp: at(55000), note: "Waiting for health check" }] },
];

const rows = (board: HTMLElement) => [...board.querySelectorAll(".stv-row:not(.stv-row-header)")] as HTMLElement[];
const titles = (board: HTMLElement) => rows(board).map((row) => row.querySelector(".stv-row-title")!.textContent);

describe("renderStoryboard — the inspector", () => {
  const board = renderStoryboard(run, { now: NOW });

  it("heads with a name, a count, and pills that say what needs attention", () => {
    expect(board.querySelector(".stv-board-title")!.textContent).toBe("Stories");
    expect(board.querySelector(".stv-board-count")!.textContent).toBe("5");
    expect([...board.querySelectorAll(".stv-pill")].map((p) => p.textContent)).toEqual(["live · 1 running", "1 failed", "1 warning"]);
    expect(board.querySelector(".stv-board-head")!.getAttribute("data-state")).toBe("failed");
    const fine = renderStoryboard([run[2]!], { now: NOW });
    expect([...fine.querySelectorAll(".stv-pill")].map((p) => p.textContent)).toEqual(["all fine"]);
  });

  it("lists root stories as rows, newest first, with status, subtitle, origin, beats, took, when", () => {
    expect(titles(board)).toEqual(["Deploy api@2.14", "Cache warmed slowly", "Digest sent", "Nightly sync failed"]);
    const failed = rows(board)[3]!;
    expect(failed.dataset["level"]).toBe("Error");
    expect(failed.querySelector(".stv-status")!.textContent).toBe("✕");
    expect(failed.querySelector(".stv-row-sub")!.textContent).toBe("deadlock detected · turned at step 4 of 4");
    expect(failed.querySelector(".stv-cell-origin")!.textContent).toBe("sync-agent");
    expect(failed.querySelector(".stv-cell-beats")!.textContent).toBe("5");
    expect(failed.querySelector(".stv-cell-took")!.textContent).toBe("31.0 s");
    expect(failed.querySelector(".stv-cell-when")!.textContent).toBe("1 min ago");
    const running = rows(board)[0]!;
    expect(running.dataset["running"]).toBe("true");
    expect(running.querySelector(".stv-status")!.getAttribute("data-running")).toBe("true");
    expect(running.querySelector(".stv-row-sub")!.textContent).toBe("Waiting for health check · 5.00 s so far");
    expect(running.querySelector(".stv-cell-when")!.textContent).toBe("now");
    expect(running.querySelector(".stv-cell-took")!.textContent).toMatch(/…$/);
    expect(rows(board)[1]!.querySelector(".stv-row-sub")!.textContent).toBe("1 warning");
    expect(board.querySelector('.stv-row[data-story-id="schema"]')).toBeNull();
  });

  it("unfolds a row to its steps on click or Enter, and folds it again", () => {
    const failed = board.querySelector('.stv-row[data-story-id="root"]') as HTMLElement;
    expect(failed.getAttribute("aria-expanded")).toBe("false");
    failed.click();
    const opened = board.querySelector('.stv-row[data-story-id="root"]') as HTMLElement;
    expect(opened.getAttribute("aria-expanded")).toBe("true");
    const steps = board.querySelector('.stv-row-steps[data-story-id="root"]')!;
    expect(steps.previousElementSibling).toBe(opened);
    expect([...steps.querySelectorAll(":scope > .stv-flow-steps > .stv-step > .stv-step-marker > .stv-step-number")].map((n) => n.textContent)).toEqual(["1", "2", "3", "4", "5", "✕"]);
    expect(steps.querySelector('.stv-step[data-turn="true"] .stv-step-text')!.textContent).toBe("Upsert failed");
    // A failed row starts with its failed step's detail open
    expect((steps.querySelector('.stv-step[data-turn="true"] details') as HTMLDetailsElement).open).toBe(true);
    expect(steps.querySelector(".stv-error-name")!.textContent).toBe("DeadlockError");
    opened.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(board.querySelector(".stv-row-steps")).toBeNull();
  });

  it("narrows by tab and by search, and keeps that while updating in place", () => {
    const live = createStoryboard(run, { now: NOW });
    const tab = (name: string) => (live.element.querySelector(`.stv-board-tab[data-tab="${name}"]`) as HTMLButtonElement);
    expect([...live.element.querySelectorAll(".stv-board-tab-count")].map((n) => n.textContent)).toEqual(["5", "1", "1", "1"]);
    tab("failing").click();
    expect(titles(live.element)).toEqual(["Nightly sync failed"]);
    expect(tab("failing").getAttribute("aria-selected")).toBe("true");
    tab("running").click();
    expect(titles(live.element)).toEqual(["Deploy api@2.14"]);
    tab("all").click();
    const search = live.element.querySelector(".stv-board-search") as HTMLInputElement;
    search.value = "digest";
    search.dispatchEvent(new Event("input"));
    expect(titles(live.element)).toEqual(["Digest sent"]);
    expect(live.shown().map((story) => story.storyId)).toEqual(["digest"]);
    rows(live.element)[0]!.click();
    live.update([...run, { storyId: "more", timestamp: at(70000), level: "Information", title: "Digest resent", notes: [] }]);
    expect(titles(live.element)).toEqual(["Digest resent", "Digest sent"]);
    expect(live.element.querySelector('.stv-row[data-story-id="digest"]')!.getAttribute("aria-expanded")).toBe("true");
    expect((live.element.querySelector(".stv-board-search") as HTMLInputElement).value).toBe("digest");
    search.value = "nothing here";
    (live.element.querySelector(".stv-board-search") as HTMLInputElement).value = "zzz";
    live.element.querySelector(".stv-board-search")!.dispatchEvent(new Event("input"));
    expect(live.element.querySelector(".stv-board-empty")!.textContent).toBe("Nothing matches.");
  });

  it("offers an open control per row when asked, without toggling the row", () => {
    const opened: string[] = [];
    const board2 = renderStoryboard(run, { now: NOW, onSelect: (story) => opened.push(story.title) });
    const button = board2.querySelector('.stv-row[data-story-id="digest"] .stv-row-open') as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Open Digest sent");
    button.click();
    expect(opened).toEqual(["Digest sent"]);
    expect(board2.querySelector('.stv-row[data-story-id="digest"]')!.getAttribute("aria-expanded")).toBe("false");
    expect(board.querySelector(".stv-row-open")).toBeNull();
  });

  it("can hide the toolbar, start with rows open, and says so when there is nothing", () => {
    const plain = renderStoryboard(run, { now: NOW, toolbar: false, expanded: ["digest"] });
    expect((plain.querySelector(".stv-board-toolbar") as HTMLElement).hidden).toBe(true);
    expect(plain.querySelector('.stv-row-steps[data-story-id="digest"]')).not.toBeNull();
    const empty = renderStoryboard([]);
    expect(empty.querySelector(".stv-board-count")!.textContent).toBe("0");
    expect(empty.querySelector(".stv-board-empty")!.textContent).toBe("Nothing to show yet.");
  });

  it("never turns content into markup", () => {
    const hostile = renderStoryboard([{ storyId: "h", timestamp: at(0), level: "Error", title: "<img src=x onerror=alert(1)>", origin: { who: "<b>x</b>" }, notes: [{ timestamp: at(0), note: "<script>1</script>", what: { html: "<iframe>" }, error: { message: "<i>e</i>" } }] }], { expanded: ["h"], unfold: "all" });
    expect(hostile.querySelector("img, script, b, i, iframe")).toBeNull();
    expect(hostile.querySelector(".stv-row-title")!.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(hostile.querySelector(".stv-row:not(.stv-row-header) .stv-cell-origin")!.textContent).toBe("<b>x</b>");
  });
});

describe("formatAgo", () => {
  const from = new Date("2026-09-05T12:00:00.000Z");
  it("reads the way people say it", () => {
    expect(formatAgo(from, "2026-09-05T11:59:58.000Z")).toBe("just now");
    expect(formatAgo(from, "2026-09-05T11:59:20.000Z")).toBe("40 s ago");
    expect(formatAgo(from, "2026-09-05T11:45:00.000Z")).toBe("15 min ago");
    expect(formatAgo(from, "2026-09-05T09:00:00.000Z")).toBe("3 h ago");
    expect(formatAgo(from, "2026-09-04T09:00:00.000Z")).toBe("yesterday");
    expect(formatAgo(from, "2026-09-01T09:00:00.000Z")).toBe("4 d ago");
    expect(formatAgo(from, "2026-09-05T12:00:05.000Z")).toBe("now");
    expect(formatAgo(from, "not a time")).toBe("not a time");
  });
});
