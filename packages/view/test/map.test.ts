import { beforeAll, describe, expect, it } from "vitest";
import { buildStoryMap, laneOf } from "../src/map";
import { toMermaid } from "../src/mermaid";
import { renderStoryMap } from "../src/renderMap";
import type { StoryRecord } from "../src/types";
import { buildFixtures, type Fixtures } from "./fixtures/stories";

const at = (ms: number) => new Date(Date.UTC(2026, 8, 5, 12, 0, 0, ms)).toISOString();

/** A run: a root with two chapters (one failed), a second root in another lane, an orphan */
const run: StoryRecord[] = [
  { storyId: "root", timestamp: at(100), level: "Error", title: "Order failed", origin: { who: "checkout" }, durationMs: 100, notes: [{ timestamp: at(0), note: "Received" }, { timestamp: at(90), note: "Charge failed", level: "Error", error: { message: "declined" } }], error: { message: "aborted" } },
  { storyId: "ch1", timestamp: at(40), level: "Information", title: "Inventory reserved", parentStoryId: "root", origin: { who: "inventory" }, durationMs: 20, notes: [{ timestamp: at(20), note: "Reserved" }] },
  { storyId: "ch2", timestamp: at(80), level: "Warning", title: "Payment retried", parentStoryId: "root", durationMs: 30, notes: [] },
  { storyId: "other", timestamp: at(60), level: "Information", title: "Digest sent", origin: { who: "mailer" }, durationMs: 10, notes: [{ timestamp: at(50), note: "Built" }, { timestamp: at(60), note: "Sent" }] },
  { storyId: "lost", timestamp: at(30), level: "Information", title: "A chapter of nothing", parentStoryId: "gone", notes: [] },
];

describe("buildStoryMap", () => {
  it("hangs chapters off their parents, in their parent's lane, and marks orphans", () => {
    const map = buildStoryMap(run);
    expect(map.count).toBe(5);
    expect(map.roots.map((node) => node.id)).toEqual(["root", "lost", "other"]);
    expect(map.rows.map((node) => node.id)).toEqual(["root", "ch1", "ch2", "lost", "other"]);
    expect(map.rows.map((node) => node.depth)).toEqual([0, 1, 1, 0, 0]);
    expect(map.rows.map((node) => node.lane)).toEqual(["checkout", "checkout", "checkout", "stories", "mailer"]);
    expect(map.lanes).toEqual(["checkout", "stories", "mailer"]);
    expect(map.rows.find((node) => node.id === "lost")!.orphan).toBe(true);
    expect(map.rows.find((node) => node.id === "root")!.failed).toBe(true);
    expect(map.rows.find((node) => node.id === "ch2")!.failed).toBe(false);
  });

  it("finds each story's span from its beats and duration, and the map's from all of them", () => {
    const map = buildStoryMap(run);
    const root = map.rows[0]!;
    expect(root.end - root.start).toBe(100);
    expect(new Date(root.start).toISOString()).toBe(at(0));
    expect(map.start).toBe(root.start);
    expect(map.end).toBe(root.end);
    const bare = buildStoryMap([{ timestamp: at(5), level: "Information", title: "No beats", notes: [] }]);
    expect(bare.rows[0]!.start).toBe(bare.rows[0]!.end);
    expect(bare.rows[0]!.id).toBe("story-0");
  });

  it("survives a cycle in parent ids", () => {
    const map = buildStoryMap([
      { storyId: "a", timestamp: at(1), level: "Information", title: "A", parentStoryId: "b", notes: [] },
      { storyId: "b", timestamp: at(2), level: "Information", title: "B", parentStoryId: "a", notes: [] },
    ]);
    expect(map.rows).toHaveLength(2);
    // The entry into the cycle is drawn as a root and marked; the other is its chapter
    expect(map.rows[0]!.orphan).toBe(true);
    expect(map.rows[1]!.depth).toBe(1);
  });

  it("picks a lane from the origin", () => {
    expect(laneOf({ timestamp: at(0), level: "Information", title: "", notes: [], origin: { who: "svc" } })).toBe("svc");
    expect(laneOf({ timestamp: at(0), level: "Information", title: "", notes: [], origin: { where: { app: "web", page: "x" } } })).toBe("web");
    expect(laneOf({ timestamp: at(0), level: "Information", title: "", notes: [], origin: { who: { id: 1 } } })).toBe("stories");
    expect(laneOf({ timestamp: at(0), level: "Information", title: "", notes: [] })).toBe("stories");
  });

  it("maps real fixtures from the library", async () => {
    const fixtures: Fixtures = await buildFixtures();
    const map = buildStoryMap(Object.values(fixtures.stories));
    const main = map.roots.find((node) => node.story.title === "Order ord_9f2 failed")!;
    expect(main.children.map((node) => node.story.title)).toEqual(["Inventory reserved"]);
    expect(main.children[0]!.lane).toBe(main.lane);
  });
});

describe("toMermaid", () => {
  it("writes a flowchart with runs as subgraphs, chapters as edges, and failures styled", () => {
    const text = toMermaid(run);
    const lines = text.split("\n");
    expect(lines[0]).toBe("flowchart TB");
    expect(text).toContain('subgraph s0_root_run["Order failed"]');
    expect(text).toContain("s0_root --> s1_ch1");
    expect(text).toContain("s0_root --> s2_ch2");
    expect(text).toContain("class s0_root error");
    expect(text).toContain("class s2_ch2 warn");
    expect(text).toContain("class s3_lost orphan");
    expect(text).toContain("error · 100 ms · 2 beats");
    expect(toMermaid(run, { direction: "LR" })).toContain("flowchart LR");
  });

  it("escapes what would break a diagram, and cuts long labels", () => {
    const text = toMermaid([{ storyId: "x", timestamp: at(0), level: "Information", title: 'He said "hi"; #1', notes: [] }]);
    expect(text).toContain('["He said #quot;hi#quot;#59; #35;1<br/>');
    const long = toMermaid([{ storyId: "y", timestamp: at(0), level: "Information", title: "a".repeat(100), notes: [] }], { maxLabel: 20 });
    expect(long).toContain(`["${"a".repeat(19)}…<br/>`);
  });

  it("writes a gantt with lanes as sections and failures critical", () => {
    const text = toMermaid(run, { kind: "gantt" });
    expect(text.split("\n").slice(0, 3)).toEqual(["gantt", "  dateFormat x", "  axisFormat %H:%M:%S"]);
    expect(text).toContain("section checkout");
    expect(text).toContain("section mailer");
    expect(text).toMatch(/Order failed :crit, s0_root, \d+, \d+/);
    expect(text).toMatch(/Payment retried :active, s2_ch2, \d+, \d+/);
  });
});

describe("renderStoryMap", () => {
  let map: SVGSVGElement;
  beforeAll(() => {
    map = renderStoryMap(run, { width: 800 });
  });

  it("draws a row per story with its level, depth and bar, grouped in lanes", () => {
    expect(map.tagName.toLowerCase()).toBe("svg");
    expect(map.getAttribute("aria-label")).toBe("Story map: 5 stories in 3 lanes");
    const rows = [...map.querySelectorAll(".stv-map-row")];
    expect(rows.map((row) => row.getAttribute("data-story-id"))).toEqual(["root", "ch1", "ch2", "lost", "other"]);
    expect(rows.map((row) => row.getAttribute("data-depth"))).toEqual(["0", "1", "1", "0", "0"]);
    expect(rows[0]!.getAttribute("data-level")).toBe("Error");
    expect(rows[3]!.getAttribute("data-orphan")).toBe("true");
    expect(map.querySelectorAll(".stv-map-lane").length).toBe(3);
    expect([...map.querySelectorAll(".stv-map-lane")].map((lane) => lane.textContent)).toEqual(["checkout", "stories", "mailer"]);
  });

  it("draws beats on the bar and connectors from parents to chapters", () => {
    expect(map.querySelectorAll(".stv-map-beat").length).toBe(5);
    expect(map.querySelector('.stv-map-beat[data-level="Error"]')).not.toBeNull();
    expect(map.querySelectorAll(".stv-map-link").length).toBe(2);
    const rootBar = map.querySelector('.stv-map-row[data-story-id="root"] .stv-map-bar')!;
    const chapterBar = map.querySelector('.stv-map-row[data-story-id="ch1"] .stv-map-bar')!;
    expect(Number(rootBar.getAttribute("width"))).toBeGreaterThan(Number(chapterBar.getAttribute("width")));
    expect(Number(chapterBar.getAttribute("x"))).toBeGreaterThan(Number(rootBar.getAttribute("x")));
    expect(map.querySelectorAll(".stv-map-tick").length).toBe(6);
    // The root spans the whole width, so its label sits inside the bar, whole
    const rootLabel = map.querySelector('.stv-map-row[data-story-id="root"] .stv-map-label')!;
    expect(rootLabel.classList.contains("stv-map-label-inside")).toBe(true);
    expect(rootLabel.textContent).toBe("Order failed");
    expect(map.querySelector('.stv-map-row[data-story-id="other"] .stv-map-label')!.textContent).toBe("Digest sent");
    expect(map.querySelector(".stv-map-tick")!.textContent).toBe("+0 ms");
  });

  it("opens a story on click or Enter", () => {
    const opened: string[] = [];
    const interactive = renderStoryMap(run, { onSelect: (story) => opened.push(story.title) });
    const row = interactive.querySelector('.stv-map-row[data-story-id="ch2"]')!;
    expect(row.getAttribute("data-selectable")).toBe("true");
    expect(row.getAttribute("role")).toBe("button");
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(opened).toEqual(["Payment retried", "Payment retried"]);
    expect(map.querySelector(".stv-map-row")!.getAttribute("data-selectable")).toBeNull();
  });

  it("never turns a title into markup", () => {
    const hostile = renderStoryMap([{ storyId: "h", timestamp: at(0), level: "Error", title: '<script>alert(1)</script><img src=x onerror=alert(1)>', origin: { who: "<b>x</b>" }, notes: [] }]);
    expect(hostile.querySelector("script, img, b")).toBeNull();
    expect(hostile.querySelector(".stv-map-row title")!.textContent).toContain("<script>");
    expect(hostile.querySelector(".stv-map-lane")!.textContent).toBe("<b>x</b>");
  });

  it("draws something sensible for nothing", () => {
    const empty = renderStoryMap([]);
    expect(empty.querySelector(".stv-map-empty")!.textContent).toBe("No stories to map");
    expect(empty.getAttribute("aria-label")).toBe("Story map: 0 stories in 0 lanes");
  });
});
