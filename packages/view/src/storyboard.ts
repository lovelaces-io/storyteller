/**
 * The storyboard: a run inspector.
 *
 * Logs are hard to read because everything is a line and every line looks the
 * same. The storyboard gives each story a row — how it went, what it was,
 * where from, how many beats, how long, when — in a list that reads the way a
 * list of runs reads anywhere else. A row opens to its numbered steps with
 * timings, green until the one that turned, and a step opens to its logs,
 * data and error: inline under the row, or in a dialog over the feed so the
 * feed keeps flowing. A story can be pinned: it sits in a strip at the top,
 * survives updates and trimming, and stays for the browser session. Tabs
 * narrow the list to what failed, warned, or is still running; a search
 * narrows it by what it mentions. All of that state survives `update()`, so
 * a live board redraws under a reader without losing their place.
 *
 * HTML, text nodes only, themed by the same knobs as everything else.
 */
import { renderStorySteps } from "./flow";
import { buildStoryMap, type MapNode } from "./map";
import { renderStory, type RenderOptions } from "./render";
import { formatDuration, formatTime, parseTime } from "./time";
import type { Level, StoryRecord } from "./types";

export type StoryboardTab = "all" | "failing" | "warnings" | "running";

export type StoryboardOptions = RenderOptions & {
  /** Called when a row's "open" control is used — for showing the full story elsewhere */
  onSelect?: (story: StoryRecord, node: MapNode) => void;
  /** Where a row opens: under itself, or in a dialog over the feed. Default "inline". */
  detail?: "inline" | "dialog";
  /** Show the tabs and the search. Default true. */
  toolbar?: boolean;
  /** Which tab starts selected. Default "all". */
  tab?: StoryboardTab;
  /** A name for the board, shown in the header */
  title?: string;
  /** The clock "2 min ago" counts from. Default: now. */
  now?: () => Date;
  /** Rows that start unfolded, by story id (inline detail) */
  expanded?: string[];
  /** Steps whose detail starts unfolded: "none", "failed" (default for a failed story), or "all" */
  unfold?: "none" | "failed" | "all";
  /** Offer a pin on every row and in the dialog. Default true. */
  pins?: boolean;
  /** Keep pins for the browser session under this key in sessionStorage. Default: derived from `title`. Pass null to keep them in memory only. */
  pinsKey?: string | null;
  /** When given, the dialog offers a "save" action that hands the story over — to a store, a report, wherever it should live */
  onSave?: (story: StoryRecord) => void;
  /** The save action's label. Default "save for later". */
  saveLabel?: string;
};

/** A board that can be updated in place, keeping its tab, search, pins and open rows */
export type Storyboard = {
  readonly element: HTMLElement;
  update(stories: StoryRecord[]): void;
  /** The stories currently listed, after the tab and the search */
  shown(): StoryRecord[];
  /** The pinned stories, as last seen */
  pinned(): StoryRecord[];
  pin(storyId: string): void;
  unpin(storyId: string): void;
  /** Open a story: under its row, or in the dialog, per `detail` */
  open(storyId: string): void;
  close(): void;
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

function button(ctx: Ctx, className: string, text: string, label?: string): HTMLButtonElement {
  const b = el(ctx, "button", className, text);
  b.type = "button";
  if (label) b.setAttribute("aria-label", label);
  return b;
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

/** sessionStorage, if this environment has one and allows it */
function session(): Storage | undefined {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Create a board that can be updated in place. `renderStoryboard` is this, drawn once. */
export function createStoryboard(initial: StoryRecord[], options: StoryboardOptions = {}): Storyboard {
  const ctx: Ctx = { doc: resolveDocument(options), options };
  const detailMode = options.detail ?? "inline";
  const pinsEnabled = options.pins !== false;
  const pinsKey = options.pinsKey === undefined ? `storyteller-view:pins:${options.title ?? "default"}` : options.pinsKey;
  const now = options.now ?? (() => new Date());

  const state = {
    tab: options.tab ?? "all",
    query: "",
    expanded: new Set<string>(options.expanded ?? []),
    pinned: new Map<string, StoryRecord>(),
    stories: initial,
    shown: [] as StoryRecord[],
    dialogFor: undefined as string | undefined,
  };

  // Pins from earlier in this session
  if (pinsEnabled && pinsKey) {
    try {
      const raw = session()?.getItem(pinsKey);
      if (raw) for (const story of JSON.parse(raw) as StoryRecord[]) if (story?.storyId) state.pinned.set(story.storyId, story);
    } catch {
      // a bad value in storage is not the board's problem
    }
  }
  function persistPins(): void {
    if (!pinsEnabled || !pinsKey) return;
    try {
      session()?.setItem(pinsKey, JSON.stringify([...state.pinned.values()]));
    } catch {
      // storage full or forbidden: pins live in memory for now
    }
  }

  const board = el(ctx, "div", "stv-board");
  board.setAttribute("role", "region");
  board.setAttribute("aria-label", "Storyboard");
  const head = el(ctx, "div", "stv-board-head");
  const toolbar = el(ctx, "div", "stv-board-toolbar");
  const pinnedStrip = el(ctx, "div", "stv-board-pinned");
  const table = el(ctx, "div", "stv-board-rows");
  table.setAttribute("role", "list");
  board.append(head, toolbar, pinnedStrip, table);

  // The dialog, made once, shown when a row opens in dialog mode
  const dialog = el(ctx, "dialog", "stv-dialog");
  dialog.setAttribute("aria-label", "Story");
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close(); // the backdrop
  });
  dialog.addEventListener("close", () => { state.dialogFor = undefined; });
  board.append(dialog);

  function currentMap() {
    return buildStoryMap(state.stories);
  }

  function nodeFor(storyId: string): MapNode | undefined {
    const map = currentMap();
    const live = map.rows.find((row) => row.id === storyId);
    if (live) return live;
    const pinned = state.pinned.get(storyId);
    return pinned ? buildStoryMap([pinned]).rows[0] : undefined;
  }

  function drawHead(map: ReturnType<typeof buildStoryMap>): void {
    head.replaceChildren();
    const running = map.rows.filter((node) => node.story.running).length;
    const failed = map.rows.filter((node) => node.failed && !node.story.running).length;
    const warned = map.rows.filter((node) => !node.failed && !node.story.running && node.story.level === "Warning").length;
    head.dataset["state"] = failed ? "failed" : warned ? "warned" : running ? "running" : "fine";
    head.append(el(ctx, "span", "stv-board-title", options.title ?? "Stories"));
    head.append(el(ctx, "span", "stv-board-count", `${map.count}`));
    const pills = el(ctx, "span", "stv-board-pills");
    if (running) pills.append(el(ctx, "span", "stv-pill stv-pill-running", `live · ${running} running`));
    if (failed) pills.append(el(ctx, "span", "stv-pill stv-pill-failed", `${failed} failed`));
    if (warned) pills.append(el(ctx, "span", "stv-pill stv-pill-warned", `${warned} ${warned === 1 ? "warning" : "warnings"}`));
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
      const b = el(ctx, "button", "stv-board-tab");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset["tab"] = tab;
      b.setAttribute("aria-selected", String(state.tab === tab));
      b.append(el(ctx, "span", undefined, label), el(ctx, "span", "stv-board-tab-count", String(counts[tab])));
      b.addEventListener("click", () => { state.tab = tab; draw(); });
      tabs.append(b);
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

  function drawPinned(): void {
    pinnedStrip.replaceChildren();
    if (!pinsEnabled || !state.pinned.size) { pinnedStrip.hidden = true; return; }
    pinnedStrip.hidden = false;
    pinnedStrip.append(el(ctx, "div", "stv-board-pinned-label", `Pinned · ${state.pinned.size}`));
    const list = el(ctx, "div", "stv-board-pinned-rows");
    list.setAttribute("role", "list");
    for (const story of state.pinned.values()) {
      const node = buildStoryMap([story]).rows[0]!;
      list.append(...renderRow(node, true));
    }
    pinnedStrip.append(list);
  }

  function drawRows(): void {
    const map = currentMap();
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
    for (const node of nodes) table.append(...renderRow(node, false));
  }

  function renderRow(node: MapNode, inPinnedStrip: boolean): HTMLElement[] {
    const { story } = node;
    const id = node.id;
    const openInline = detailMode === "inline" && state.expanded.has(id) && !inPinnedStrip;
    const row = el(ctx, "div", "stv-row");
    row.setAttribute("role", "listitem");
    row.dataset["storyId"] = id;
    const st = status(node);
    row.dataset["level"] = st.level;
    if (st.running) row.dataset["running"] = "true";
    if (node.failed) row.dataset["failed"] = "true";
    if (openInline) row.dataset["open"] = "true";
    if (state.pinned.has(id)) row.dataset["pinned"] = "true";
    row.tabIndex = 0;
    if (detailMode === "inline") row.setAttribute("aria-expanded", String(openInline));
    else row.setAttribute("aria-haspopup", "dialog");

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
    const actions = el(ctx, "span", "stv-cell-chevron");
    if (pinsEnabled) {
      const pinned = state.pinned.has(id);
      const pin = button(ctx, "stv-row-pin", pinned ? "unpin" : "pin", `${pinned ? "Unpin" : "Pin"} ${story.title}`);
      pin.setAttribute("aria-pressed", String(pinned));
      pin.addEventListener("click", (event) => { event.stopPropagation(); if (pinned) unpin(id); else pin_(id); });
      actions.append(pin);
    }
    if (options.onSelect) {
      const open = button(ctx, "stv-row-open", "open", `Open ${story.title}`);
      open.addEventListener("click", (event) => { event.stopPropagation(); options.onSelect!(story, node); });
      actions.append(open);
    }
    actions.append(el(ctx, "span", "stv-chevron", openInline ? "⌄" : "›"));
    row.append(dot, cell, origin, beats, took, when, actions);

    const activate = () => {
      if (detailMode === "dialog") { openDialog(id); return; }
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      drawRows();
      drawPinned();
    };
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") { event.preventDefault(); activate(); }
    });

    if (!openInline) return [row];
    const steps = el(ctx, "div", "stv-row-steps");
    steps.dataset["storyId"] = id;
    steps.append(renderStorySteps(node, { ...options, unfold: options.unfold ?? (node.failed ? "failed" : "none") }));
    steps.addEventListener("click", (event) => event.stopPropagation());
    return [row, steps];
  }

  function fillDialog(node: MapNode): void {
    const { story } = node;
    dialog.replaceChildren();
    dialog.dataset["level"] = story.level;
    if (story.running) dialog.dataset["running"] = "true";
    else delete dialog.dataset["running"];
    const st = status(node);

    const dhead = el(ctx, "div", "stv-dialog-head");
    const glyph = el(ctx, "span", "stv-status", st.glyph);
    glyph.dataset["level"] = st.level;
    if (st.running) glyph.dataset["running"] = "true";
    const titles = el(ctx, "div", "stv-dialog-titles");
    titles.append(el(ctx, "div", "stv-dialog-title", story.title));
    const sub = subtitle(node);
    if (sub) titles.append(el(ctx, "div", "stv-dialog-sub", sub));
    const meta: string[] = [];
    if (node.lane !== "stories") meta.push(node.lane);
    if (story.durationMs !== undefined) meta.push(formatDuration(story.durationMs));
    if (story.running) meta.push("still running");
    meta.push(formatTime(options.locale, options.timeZone, story.timestamp));
    if (story.storyId) meta.push(story.storyId);
    titles.append(el(ctx, "div", "stv-dialog-meta", meta.join(" · ")));
    const actions = el(ctx, "div", "stv-dialog-actions");
    if (pinsEnabled) {
      const pinned = state.pinned.has(node.id);
      const pin = button(ctx, "stv-dialog-action", pinned ? "unpin" : "pin", `${pinned ? "Unpin" : "Pin"} ${story.title}`);
      pin.setAttribute("aria-pressed", String(pinned));
      pin.addEventListener("click", () => { if (state.pinned.has(node.id)) unpin(node.id); else pin_(node.id); });
      actions.append(pin);
    }
    if (options.onSave) {
      const save = button(ctx, "stv-dialog-action", options.saveLabel ?? "save for later", `Save ${story.title}`);
      save.addEventListener("click", () => options.onSave!(story));
      actions.append(save);
    }
    const closeButton = button(ctx, "stv-dialog-action stv-dialog-close", "close", "Close");
    closeButton.addEventListener("click", close);
    actions.append(closeButton);
    dhead.append(glyph, titles, actions);

    const body = el(ctx, "div", "stv-dialog-body");
    body.append(el(ctx, "div", "stv-dialog-section", "Steps"));
    body.append(renderStorySteps(node, { ...options, unfold: options.unfold ?? (node.failed ? "failed" : "none") }));
    const record = el(ctx, "details", "stv-dialog-record");
    record.append(el(ctx, "summary", "stv-dialog-section", "The full record"));
    record.append(renderStory(story, { ...options, expandDepth: options.expandDepth ?? 1 }));
    body.append(record);
    dialog.append(dhead, body);
  }

  function openDialog(storyId: string): void {
    const node = nodeFor(storyId);
    if (!node) return;
    state.dialogFor = storyId;
    fillDialog(node);
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
  }

  function close(): void {
    state.dialogFor = undefined;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function pin_(storyId: string): void {
    const node = nodeFor(storyId);
    if (!node) return;
    state.pinned.set(storyId, node.story);
    persistPins();
    drawPinned();
    drawRows();
    if (state.dialogFor === storyId) fillDialog(node);
  }

  function unpin(storyId: string): void {
    state.pinned.delete(storyId);
    persistPins();
    drawPinned();
    drawRows();
    if (state.dialogFor === storyId) { const node = nodeFor(storyId); if (node) fillDialog(node); }
  }

  function draw(): void {
    const map = currentMap();
    // A pinned story that is still on the board keeps up with it
    for (const node of map.rows) if (state.pinned.has(node.id)) state.pinned.set(node.id, node.story);
    drawHead(map);
    drawToolbar(map);
    drawPinned();
    drawRows();
    if (state.dialogFor) { const node = nodeFor(state.dialogFor); if (node) fillDialog(node); }
  }

  draw();
  return {
    element: board,
    update(stories) { state.stories = stories; draw(); },
    shown: () => [...state.shown],
    pinned: () => [...state.pinned.values()],
    pin: pin_,
    unpin,
    open(storyId) {
      if (detailMode === "dialog") openDialog(storyId);
      else { state.expanded.add(storyId); drawRows(); }
    },
    close,
  };
}

/** Render a run as a storyboard, once */
export function renderStoryboard(stories: StoryRecord[], options: StoryboardOptions = {}): HTMLElement {
  return createStoryboard(stories, options).element;
}
