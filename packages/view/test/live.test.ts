import { describe, expect, it } from "vitest";
import { liveStoryboard } from "../src/live";
import type { StoryRecord } from "../src/types";

const at = (ms: number) => new Date(Date.UTC(2026, 8, 5, 12, 0, 0, ms)).toISOString();
const beat = (storyId: string, ms: number, note: string, extra: Record<string, unknown> = {}) => ({ kind: "note", storyId, timestamp: at(ms), sequence: 0, note, level: "Information", ...extra });
const closed = (storyId: string, ms: number, title: string, extra: Partial<StoryRecord> = {}): StoryRecord & { kind: "story" } => ({ kind: "story", storyId, timestamp: at(ms), level: "Information", title, notes: [{ timestamp: at(0), note: "first" }], ...extra });

describe("liveStoryboard", () => {
  it("opens a running story on the first beat, grows it on the next, and closes it on the story", () => {
    const host = document.createElement("div");
    const live = liveStoryboard(host);
    expect(host.querySelector(".stv-board-count")!.textContent).toBe("0");

    live.hear(beat("s1", 0, "Fetched 1,200 rows", { origin: { who: "sync-agent" } }));
    live.flush();
    const row = host.querySelector(".stv-row:not(.stv-row-header)")!;
    expect(row.getAttribute("data-running")).toBe("true");
    expect(row.querySelector(".stv-row-title")!.textContent).toBe("Fetched 1,200 rows");
    expect(row.querySelector(".stv-cell-when")!.textContent).toBe("now");
    expect([...host.querySelectorAll(".stv-pill")].map((p) => p.textContent)).toEqual(["live · 1 running"]);
    expect(row.querySelector(".stv-cell-origin")!.textContent).toBe("sync-agent");

    live.hear(beat("s1", 4000, "Batch 1 upserted"));
    live.hear(beat("s1", 21000, "Retrying batch 3", { level: "Warning" }));
    live.flush();
    expect(host.querySelector(".stv-row:not(.stv-row-header) .stv-cell-beats")!.textContent).toBe("3");
    expect(host.querySelector(".stv-row:not(.stv-row-header)")!.getAttribute("data-level")).toBe("Warning");
    expect(live.stories()[0]!.running).toBe(true);

    live.hear(closed("s1", 31000, "Nightly sync failed", { level: "Error", error: { message: "deadlock" }, notes: [{ timestamp: at(0), note: "Fetched 1,200 rows" }, { timestamp: at(4000), note: "Batch 1 upserted" }, { timestamp: at(21000), note: "Retrying batch 3", level: "Warning" }, { timestamp: at(31000), note: "Upsert failed", level: "Error" }] }));
    live.flush();
    const done = host.querySelector(".stv-row:not(.stv-row-header)")!;
    expect(done.getAttribute("data-running")).toBeNull();
    expect(done.querySelector(".stv-row-title")!.textContent).toBe("Nightly sync failed");
    expect(done.querySelector(".stv-status")!.textContent).toBe("✕");
    expect([...host.querySelectorAll(".stv-pill")].map((p) => p.textContent)).toEqual(["1 failed"]);
    expect(done.querySelector(".stv-cell-beats")!.textContent).toBe("4");

    // A straggler after the close changes nothing: the record already has its beats
    live.hear(beat("s1", 32000, "late"));
    live.flush();
    expect(host.querySelector(".stv-row:not(.stv-row-header) .stv-cell-beats")!.textContent).toBe("4");
  });

  it("draws once after a burst of beats, not on every beat", async () => {
    const host = document.createElement("div");
    const changes: number[] = [];
    const live = liveStoryboard(host, { onChange: (stories) => changes.push(stories.length) });
    for (let i = 0; i < 20; i++) live.hear(beat(`s${i}`, i, `beat ${i}`));
    expect(changes).toEqual([0]);
    await Promise.resolve();
    expect(changes).toEqual([0, 20]);
  });

  it("keeps to its capacity, forgetting finished stories before running ones", () => {
    const host = document.createElement("div");
    const live = liveStoryboard(host, { capacity: 3 });
    live.hear(closed("a", 1, "A"));
    live.hear(beat("b", 2, "b running"));
    live.hear(closed("c", 3, "C"));
    live.hear(closed("d", 4, "D"));
    live.hear(closed("e", 5, "E"));
    live.flush();
    expect(live.stories().map((story) => story.storyId)).toEqual(["b", "d", "e"]);
  });

  it("nests a live chapter under its parent and ignores what is neither a note nor a story", () => {
    const host = document.createElement("div");
    const live = liveStoryboard(host);
    live.hear(beat("p", 0, "Parent begins"));
    live.hear(beat("ch", 100, "Chapter begins", { parentStoryId: "p" }));
    live.hear("nonsense");
    live.hear({ hello: "world" });
    live.hear(null);
    live.flush();
    expect(host.querySelectorAll(".stv-row:not(.stv-row-header)").length).toBe(1);
    (host.querySelector(".stv-row:not(.stv-row-header)") as HTMLElement).click();
    expect(host.querySelector('.stv-row-steps .stv-step[data-kind="chapter"] .stv-step-text')!.textContent).toBe("Chapter begins");
    expect([...host.querySelectorAll(".stv-pill")].map((p) => p.textContent)).toEqual(["live · 2 running"]);
  });

  it("is an audience, can be cleared, and stops drawing when destroyed", () => {
    const host = document.createElement("div");
    const live = liveStoryboard(host, { title: "ops" });
    expect(live.audience.name).toBe("storyboard:ops");
    expect(live.audience.hears).toEqual(["note", "story"]);
    live.audience.hear(closed("a", 1, "A"));
    live.flush();
    expect(host.querySelectorAll(".stv-row:not(.stv-row-header)").length).toBe(1);
    live.clear();
    live.flush();
    expect(host.querySelectorAll(".stv-row:not(.stv-row-header)").length).toBe(0);
    live.hear(closed("b", 2, "B"));
    live.destroy();
    live.hear(closed("c", 3, "C"));
    live.flush();
    expect(live.stories().map((story) => story.storyId)).toEqual(["b"]);
  });
});
