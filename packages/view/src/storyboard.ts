/**
 * The storyboard: a run inspector.
 *
 * Logs are hard to read because everything is a line and every line looks the
 * same. The storyboard gives each story a row — how it went, what it was,
 * where from, how many beats, how long, when — in a list that reads the way a
 * list of runs reads anywhere else. A row unfolds to its numbered steps with
 * timings, green until the one that turned; a step unfolds to its logs, data
 * and error. Tabs narrow it to what failed, warned, or is still running; a
 * search narrows it by what it mentions. It keeps that state across updates,
 * so a live board can redraw under a reader without losing their place.
 *
 * HTML, text nodes only, themed by the same knobs as everything else.
 */
import { renderStorySteps } from "./flow";
import { buildStoryMap, type MapNode } from "./map";
import type { RenderOptions } from "./render";
import { formatDuration, formatTime, parseTime } from "./time";
import type { Level, StoryRecord } from "./types";

export type StoryboardTab = "all" | "failing" | "warnings" | "running";

export type StoryboardOptions = RenderOptions & {
  /** Called when a row's "open" control is used — for showing the full story elsewhere */
  onSelect?: (story: StoryRecord, node: MapNode) => void;
  /** Show the tabs and the search. Default true. */
  toolbar?: boolean;
  /** Which tab starts selected. Default "all". */
  tab?: StoryboardTab;
  /** A name for the board, shown in the header */
  title?: string;
  /** The clock "2 min ago" counts from. Default: now. */
  now?: () => Date;
  /** Rows that start unfolded, by story id */
  expanded?: string[];
  /** Steps whose detail starts unfolded inside a row: "none" (default), "failed", or "all" */
  unfold?: "none" | "failed" | "all";
};

/** A board that can be updated in place, keeping its tab, search and unfolded rows */
export type Storyboard = {
  readonly element: HTMLElement;
  update(stories: StoryRecord[]): void;
  /** The stories currently shown, after the tab and the search */
  shown(): StoryRecord[];
};

type Ctx = { doc: Document; options: StoryboardOptions };

const STATUS_WORD: Record<Level, string> = { Information: "ok", Warning: "warning", Error: "failed" };
const STATUS_GLYPH: Record<Level, string> = { Information: "✓", Warning: "!", Error: "✕" };

function el<K extends keyof HTMLElementTagNameMap>(ctx: Ctx, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = ctx.doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function resolveDocument(options: RenderOptions): Document {
  const doc = options.document ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc) throw new Error("storyteller-view: no document available. Pass { document } when rendering outside a browser.");
  return doc;
}

/** "2 min ago", "just now", "yesterday" — or the clock when it is far away */
export function formatAgo(from: Date, iso: string, locale?: string, timeZone?: string): string {
  const at = parseTime(iso);
  if (!at) return iso;
  const delta = from.getTime() - at.getTime();
  if (delta < 0) return "now";
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)} s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} min ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} h ago`;
  if (delta < 2 * 86_400_000) return "yesterday";
  if (delta < 14 * 86_400_000) return `${Math.round(delta / 86_400_000)} d ago`;
  return formatTime(locale, timeZone, iso);
}

function status(node: MapNode): { level: Level; word: string; glyph: string; running: boolean } {
  if (node.story.running) return { level: node.story.level, word: "running", glyph: "", running: true };
  const level: Level = node.failed ? "Error" : node.story.level;
  return { level, word: STATUS_WORD[level], glyph: STATUS_GLYPH[level], running: false };
}

/** The one line under the title: what happened, or where it turned, or what it is doing now */
function subtitle(node: MapNode): string | undefined {
  const { story } = node;
  if (story.running) {
    const last = story.notes[story.notes.length - 1];
    const started = parseTime(story.notes[0]?.timestamp ?? story.timestamp);
    const soFar = started ? formatDuration(Math.max(0, parseTime(story.timestamp)!.getTime() - started.getTime())) : undefined;
    return [last?.note, soFar ? `${soFar} so far` : undefined].filter(Boolean).join(" · ") || undefined;
  }
  if (node.failed) {
    const beats = story.notes;
    const turnedAt = beats.findIndex((note) => note.level === "Error" || note.error !== undefined);
    const reason = story.error?.message ?? beats[turnedAt]?.error?.message ?? beats[turnedAt]?.note;
    const where = turnedAt >= 0 ? `turned at step ${turnedAt + 1} of ${beats.length}` : undefined;
    return [reason, where].filter(Boolean).join(" · ") || undefined;
  }
  if (story.level === "Warning") {
    const warned = story.notes.filter((note) => note.level === "Warning").length;
    return warned ? `${warned} ${warned === 1 ? "warning" : "warnings"}` : "finished with warnings";
  }
  if (story.droppedEmissions) return `${story.droppedEmissions} beats dropped`;
  return undefined;
}

function matches(node: MapNode, tab: StoryboardTab, query: string): boolean {
  const { story } = node;
  if (tab === "failing" && !(node.failed && !story.running)) return false;
  if (tab === "warnings" && !(story.level === "Warning" && !node.failed && !story.running)) return false;
  if (tab === "running" && !story.running) return false;
  if (query) {
    const haystack = [story.title, ...story.notes.map((note) => note.note), story.error?.message ?? "", node.lane].join("\n").toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

/** Create a board that can be updated in place. `renderStoryboard` is this, drawn once. */
export function createStoryboard(initial: StoryRecord[], options: StoryboardOptions = {}): Storyboard {
  const ctx: Ctx = { doc: resolveDocument(options), options };
  const state = {
    tab: options.tab ?? "all",
    query: "",
    expanded: new Set<string>(options.expanded ?? []),
    stories: initial,
    shown: [] as StoryRecord[],
  };
  const now = options.now ?? (() => new Date());

  // Plain divs on purpose: a host page's bare `section` / `header` rules would
  // otherwise restyle an embedded board (the docs site pads every section)
  const board = el(ctx, "div", "stv-board");
  board.setAttribute("role", "region");
  board.setAttribute("aria-label", "Storyboard");
  const head = el(ctx, "div", "stv-board-head");
  const toolbar = el(ctx, "div", "stv-board-toolbar");
  const table = el(ctx, "div", "stv-board-rows");
  table.setAttribute("role", "list");
  board.append(head, toolbar, table);

  function drawHead(map: ReturnType<typeof buildStoryMap>): void {
    head.replaceChildren();
    const running = map.rows.filter((node) => node.story.running).length;
    const failed = map.rows.filter((node) => node.failed && !node.story.running).length;
    const warned = map.rows.filter((node) => !node.failed && !node.story.running && node.story.level === "Warning").length;
    head.dataset["state"] = failed ? "failed" : warned ? "warned" : running ? "running" : "fine";
    head.append(el(ctx, "span", "stv-board-title", options.title ?? "Stories"));
    const count = el(ctx, "span", "stv-board-count", `${map.count}`);
    head.append(count);
    const pills = el(ctx, "span", "stv-board-pills");
    if (running) { const pill = el(ctx, "span", "stv-pill stv-pill-running", `live · ${running} running`); pills.append(pill); }
    if (failed) { const pill = el(ctx, "span", "stv-pill stv-pill-failed", `${failed} failed`); pills.append(pill); }
    if (warned) { const pill = el(ctx, "span", "stv-pill stv-pill-warned", `${warned} ${warned === 1 ? "warning" : "warnings"}`); pills.append(pill); }
    if (map.count && !running && !failed && !warned) pills.append(el(ctx, "span", "stv-pill stv-pill-fine", "all fine"));
    head.append(pills);
    if (map.count) {
      head.append(el(ctx, "span", "stv-board-span", `${formatTime(options.locale, options.timeZone, new Date(map.start).toISOString())} · ${formatDuration(Math.max(0, map.end - map.start))}`));
    }
  }

  function drawToolbar(map: ReturnType<typeof buildStoryMap>): void {
    toolbar.replaceChildren();
    if (options.toolbar === false) { toolbar.hidden = true; return; }
    toolbar.hidden = false;
    const tabs = el(ctx, "div", "stv-board-tabs");
    tabs.setAttribute("role", "tablist");
    const counts: Record<StoryboardTab, number> = {
      all: map.rows.length,
      failing: map.rows.filter((node) => node.failed && !node.story.running).length,
      warnings: map.rows.filter((node) => node.story.level === "Warning" && !node.failed && !node.story.running).length,
      running: map.rows.filter((node) => node.story.running).length,
    };
    for (const [tab, label] of [["all", "All"], ["failing", "Failing"], ["warnings", "Warnings"], ["running", "Running"]] as [StoryboardTab, string][]) {
      const button = el(ctx, "button", "stv-board-tab");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.dataset["tab"] = tab;
      button.setAttribute("aria-selected", String(state.tab === tab));
      button.append(el(ctx, "span", undefined, label), el(ctx, "span", "stv-board-tab-count", String(counts[tab])));
      button.addEventListener("click", () => { state.tab = tab; draw(); });
      tabs.append(button);
    }
    toolbar.append(tabs);
    const search = el(ctx, "input", "stv-board-search");
    search.type = "search";
    search.placeholder = "mentions…";
    search.setAttribute("aria-label", "Only stories that mention");
    search.value = state.query;
    search.addEventListener("input", () => { state.query = search.value.trim().toLowerCase(); drawRows(); });
    toolbar.append(search);
  }

  function drawRows(): void {
    const map = buildStoryMap(state.stories);
    const nodes = map.roots.filter((node) => matches(node, state.tab, state.query));
    // Newest first: a monitor reads from the top
    nodes.sort((a, b) => b.start - a.start);
    state.shown = nodes.map((node) => node.story);
    table.replaceChildren();
    if (!nodes.length) {
      table.append(el(ctx, "p", "stv-board-empty", map.count ? "Nothing matches." : "Nothing to show yet."));
      return;
    }
    const header = el(ctx, "div", "stv-row stv-row-header");
    header.setAttribute("aria-hidden", "true");
    for (const [cls, text] of [["stv-cell-status", ""], ["stv-cell-story", "story"], ["stv-cell-origin", "origin"], ["stv-cell-beats", "beats"], ["stv-cell-took", "took"], ["stv-cell-when", "when"], ["stv-cell-chevron", ""]]) header.append(el(ctx, "span", cls, text));
    table.append(header);
    for (const node of nodes) table.append(...renderRow(node));
  }

  function renderRow(node: MapNode): HTMLElement[] {
    const { story } = node;
    const id = node.id;
    const open = state.expanded.has(id);
    const row = el(ctx, "div", "stv-row");
    row.setAttribute("role", "listitem");
    row.dataset["storyId"] = id;
    const st = status(node);
    row.dataset["level"] = st.level;
    if (st.running) row.dataset["running"] = "true";
    if (node.failed) row.dataset["failed"] = "true";
    if (open) row.dataset["open"] = "true";
    row.tabIndex = 0;
    row.setAttribute("aria-expanded", String(open));

    const dot = el(ctx, "span", "stv-cell-status");
    const glyph = el(ctx, "span", "stv-status", st.glyph);
    glyph.dataset["level"] = st.level;
    if (st.running) glyph.dataset["running"] = "true";
    glyph.setAttribute("aria-label", st.word);
    dot.append(glyph);

    const cell = el(ctx, "span", "stv-cell-story");
    cell.append(el(ctx, "span", "stv-row-title", story.title));
    const sub = subtitle(node);
    if (sub) cell.append(el(ctx, "span", "stv-row-sub", sub));

    const origin = el(ctx, "span", "stv-cell-origin", node.lane === "stories" ? "" : node.lane);
    const beats = el(ctx, "span", "stv-cell-beats", String(story.notes.length + node.children.length));
    const took = el(ctx, "span", "stv-cell-took", story.running ? `${formatDuration(Math.max(0, now().getTime() - node.start))}…` : story.durationMs !== undefined ? formatDuration(story.durationMs) : "");
    const when = el(ctx, "span", "stv-cell-when", story.running ? "now" : formatAgo(now(), story.timestamp, options.locale, options.timeZone));
    when.title = story.timestamp;
    const chevron = el(ctx, "span", "stv-cell-chevron");
    if (options.onSelect) {
      const button = el(ctx, "button", "stv-row-open", "open");
      button.type = "button";
      button.setAttribute("aria-label", `Open ${story.title}`);
      button.addEventListener("click", (event) => { event.stopPropagation(); options.onSelect!(story, node); });
      chevron.append(button);
    }
    chevron.append(el(ctx, "span", "stv-chevron", open ? "⌄" : "›"));
    row.append(dot, cell, origin, beats, took, when, chevron);

    const toggle = () => {
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      drawRows();
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") { event.preventDefault(); toggle(); }
    });

    if (!open) return [row];
    const steps = el(ctx, "div", "stv-row-steps");
    steps.dataset["storyId"] = id;
    const unfold = options.unfold ?? (node.failed ? "failed" : "none");
    steps.append(renderStorySteps(node, { ...options, unfold }));
    // Clicks inside the steps are the steps' own business, not a row toggle
    steps.addEventListener("click", (event) => event.stopPropagation());
    return [row, steps];
  }

  function draw(): void {
    const map = buildStoryMap(state.stories);
    drawHead(map);
    drawToolbar(map);
    drawRows();
  }

  draw();
  return {
    element: board,
    update(stories) { state.stories = stories; draw(); },
    shown: () => [...state.shown],
  };
}

/** Render a run as a storyboard, once */
export function renderStoryboard(stories: StoryRecord[], options: StoryboardOptions = {}): HTMLElement {
  return createStoryboard(stories, options).element;
}
