import { beforeAll, describe, expect, it } from "vitest";
import type { StoryEvent } from "@lovelaces-io/storyteller";
import { formatDuration, renderError, renderNote, renderStory, renderValue } from "../src/index";
import type { StoryRecord } from "../src/types";
import { buildFixtures, type Fixtures } from "./fixtures/stories";
import loreErrorJson from "./fixtures/lore-error.json";

// JSON imports widen "Error" to string; the record is what the file says it is
const loreError = loreErrorJson as StoryRecord;

let fixtures: Fixtures;
let main: StoryEvent;
let root: HTMLElement;

const texts = (scope: ParentNode, selector: string) =>
  [...scope.querySelectorAll(selector)].map((node) => node.textContent);

beforeAll(async () => {
  fixtures = await buildFixtures();
  main = fixtures.stories["Order ord_9f2 failed"]!;
  root = renderStory(main, { locale: "en-US", timeZone: "UTC" });
});

describe("renderStory", () => {
  it("renders the header: level, title, time, duration, count, id", () => {
    expect(root.dataset["level"]).toBe("Error");
    expect(root.querySelector(".stv-title")!.textContent).toBe("Order ord_9f2 failed");
    expect(root.querySelector(".stv-story-head .stv-level")!.textContent).toBe("error");
    expect(root.querySelector(".stv-meta time")!.getAttribute("datetime")).toBe(main.timestamp);
    expect(root.querySelector(".stv-duration")).not.toBeNull();
    expect(root.querySelector(".stv-count")!.textContent).toBe(`${main.notes.length} notes`);
    expect(root.querySelector(".stv-id")!.textContent).toBe(main.storyId);
  });

  it("renders the origin as context", () => {
    const origin = root.querySelector(".stv-origin")!;
    expect(texts(origin, ".stv-key")).toContain("who");
    expect(origin.textContent).toContain("checkout-service");
    expect(origin.textContent).toContain("us-east-1");
  });

  it("renders every note in sequence order even when the input is shuffled", () => {
    const shuffled: StoryRecord = { ...main, notes: [...main.notes].reverse() };
    const items = renderStory(shuffled).querySelectorAll("ol.stv-notes > li.stv-note");
    expect(items.length).toBe(main.notes.length);
    expect([...items].map((li) => li.getAttribute("data-sequence"))).toEqual(main.notes.map((n) => String(n.sequence)));
    expect(items[0]!.querySelector(".stv-text")!.textContent).toBe("Order received");
  });

  it("labels each note with an offset from the story start", () => {
    const times = texts(root, "ol.stv-notes .stv-time");
    expect(times[0]).toBe("+0 ms");
    for (const label of times) expect(label).toMatch(/^\+\d/);
  });

  it("shows level badges only for warnings and errors", () => {
    const notes = [...root.querySelectorAll("ol.stv-notes > li.stv-note")];
    const withBadge = notes.filter((li) => li.querySelector(".stv-level"));
    const nonInfo = main.notes.filter((n) => n.level && n.level !== "Information");
    expect(withBadge.length).toBe(nonInfo.length);
    expect(notes[0]!.querySelector(".stv-level")).toBeNull();
  });

  it("renders the closing error", () => {
    const closing = root.querySelector(".stv-story-error .stv-error")!;
    expect(closing.querySelector(".stv-error-message")!.textContent).toBe("Checkout aborted");
    expect(closing.querySelector(".stv-cause .stv-error-message")!.textContent).toBe("layer 1 failed");
  });

  it("links a chapter to its parent", () => {
    const chapter = renderStory(fixtures.stories["Inventory reserved"]!);
    const parent = chapter.querySelector(".stv-parent")!;
    expect(parent.getAttribute("data-parent-story-id")).toBe(fixtures.mainStoryId);
  });

  it("renders a stored record with no kind and no summarize", () => {
    const view = renderStory(loreError);
    expect(view.querySelector(".stv-title")!.textContent).toBe("The app shell crashed");
    expect(view.querySelectorAll("li.stv-note").length).toBe(2);
    expect(view.textContent).toContain("global-error-boundary");
    expect(view.querySelector("li.stv-note .stv-error-name")!.textContent).toBe("TypeError");
    expect(view.querySelector(".stv-pre")!.textContent).toContain("app/layout.tsx:42:13");
  });

  it("warns about dropped emissions and hides ids on request", () => {
    const view = renderStory({ ...loreError, droppedEmissions: 3 }, { showIds: false });
    expect(view.querySelector(".stv-dropped")!.textContent).toBe("3 dropped");
    expect(view.querySelector(".stv-id")).toBeNull();
    expect(view.querySelector(".stv-seq")).toBeNull();
  });
});

describe("markers", () => {
  it("shows @type tags as badges", () => {
    const tags = texts(root, ".stv-type");
    expect(tags).toContain("Map");
    expect(tags).toContain("Set");
  });

  it("shows circular references with the path they point to", () => {
    const refs = [...root.querySelectorAll(".stv-circular")];
    expect(refs.length).toBeGreaterThanOrEqual(2);
    for (const ref of refs) {
      expect(ref.getAttribute("data-path")).toMatch(/^\$/);
      expect(ref.textContent).toContain("same as");
    }
  });

  it("shows redaction as redaction, never the marker string", () => {
    expect(root.querySelectorAll(".stv-redacted").length).toBeGreaterThanOrEqual(2);
    expect(root.textContent).not.toContain("[redacted]");
  });

  it("describes each kind of truncation in words", () => {
    const kinds = [...root.querySelectorAll(".stv-truncated[data-kind]")].map((n) => n.getAttribute("data-kind"));
    for (const kind of ["array", "properties", "depth", "bytes", "causeChain"]) expect(kinds).toContain(kind);
    expect(root.querySelector('.stv-truncated[data-kind="array"]')!.textContent).toBe("50 more items not kept");
    expect(root.querySelector('.stv-truncated[data-kind="causeChain"]')!.textContent).toBe("cause chain continues, not kept");
    const cut = [...root.querySelectorAll(".stv-string .stv-truncated")].find((n) => n.textContent!.includes("characters"));
    expect(cut!.textContent).toBe("1000 more characters not kept");
  });

  it("nests the cause chain five deep then stops", () => {
    const note = [...root.querySelectorAll("li.stv-note")].find((li) => li.textContent!.includes("Charge failed"))!;
    expect(note.querySelectorAll(".stv-error").length).toBe(6);
    expect(texts(note, ".stv-error-message")[0]).toBe("layer 7 failed");
  });

  it("lists AggregateError members", () => {
    const note = [...root.querySelectorAll("li.stv-note")].find((li) => li.textContent!.includes("Several things failed"))!;
    expect(texts(note, ".stv-errors .stv-error-message")).toEqual(["first", "second"]);
  });
});

describe("safety", () => {
  it("never turns story content into markup", () => {
    const hostile: StoryRecord = {
      timestamp: "2026-09-04T00:00:00.000Z",
      level: "Error",
      title: '<img src=x onerror="window.__pwned=1">',
      origin: { where: "<script>alert(1)</script>" },
      notes: [
        {
          timestamp: "2026-09-04T00:00:00.000Z",
          sequence: 0,
          note: "<b>bold</b> & <i>",
          what: { html: "<iframe src=javascript:alert(1)>", "<svg onload=alert(1)>": 1 },
          error: { name: "<u>E</u>", message: "<style>*{display:none}</style>", stack: "<script>x</script>" },
        },
      ],
      error: { message: '"><script>alert(2)</script>' },
    };
    const view = renderStory(hostile, { expandDepth: 9 });
    expect(view.querySelector("img, script, iframe, svg, style, b, i, u")).toBeNull();
    expect(view.textContent).toContain('<img src=x onerror="window.__pwned=1">');
    expect(view.textContent).toContain("<b>bold</b> & <i>");
    expect(view.textContent).toContain("<svg onload=alert(1)>");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe("options", () => {
  it("expandDepth controls which trees start open", () => {
    const closed = renderStory(main, { expandDepth: 0 });
    expect([...closed.querySelectorAll("details.stv-tree")].every((d) => !(d as HTMLDetailsElement).open)).toBe(true);
    const open = renderStory(main, { expandDepth: 99 });
    expect([...open.querySelectorAll("details.stv-tree")].every((d) => (d as HTMLDetailsElement).open)).toBe(true);
    const one = renderStory(main, { expandDepth: 1 });
    const trees = [...one.querySelectorAll("details.stv-tree")] as HTMLDetailsElement[];
    expect(trees.some((d) => d.open) && trees.some((d) => !d.open)).toBe(true);
  });

  it("falls back to ISO when the time zone is invalid instead of throwing", () => {
    const view = renderStory(loreError, { timeZone: "Not/AZone" });
    expect(view.querySelector(".stv-meta time")!.textContent).toBe(loreError.timestamp);
  });

  it("keeps an unparseable timestamp as-is", () => {
    const view = renderNote({ timestamp: "yesterday-ish", note: "odd clock" });
    expect(view.querySelector(".stv-time")!.textContent).toBe("yesterday-ish");
  });
});

describe("renderNote, renderError, renderValue", () => {
  it("renders a live emission on its own", () => {
    const emission = fixtures.notes.find((n) => n.note === "Payment retry scheduled")!;
    const view = renderNote(emission);
    expect(view.tagName).toBe("ARTICLE");
    expect(view.dataset["storyId"]).toBe(fixtures.mainStoryId);
    expect(view.querySelector(".stv-level")!.textContent).toBe("warn");
    expect(view.querySelector(".stv-time")!.textContent).not.toMatch(/^\+/);
    expect(view.textContent).toContain("payments.charge");
  });

  it("renders an error and a bare value", () => {
    const error = renderError({ name: "RangeError", message: "too far", cause: "network" });
    expect(error.querySelector(".stv-cause")!.textContent).toContain("network");
    expect(renderValue(42).textContent).toBe("42");
    expect(renderValue(null).className).toBe("stv-null");
    const tree = renderValue({ a: [1, { b: true }] }, { expandDepth: 3 });
    expect(texts(tree, ".stv-key")).toEqual(["a", "0", "1", "b"]);
    expect(renderValue({ "@truncated": { kind: "depth", depth: 6 } }).textContent).toBe(
      "nested deeper than 6 levels, not kept"
    );
  });
});

describe("formatDuration", () => {
  it("reads at every scale", () => {
    expect(formatDuration(12)).toBe("12 ms");
    expect(formatDuration(1900)).toBe("1.90 s");
    expect(formatDuration(31_400)).toBe("31.4 s");
    expect(formatDuration(125_000)).toBe("2m 05s");
    expect(formatDuration(3_700_000)).toBe("1h 02m");
    expect(formatDuration(90_000_000)).toBe("1d 1h");
    expect(formatDuration(-1)).toBe("");
  });
});
