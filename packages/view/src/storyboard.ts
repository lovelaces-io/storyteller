/**
 * The storyboard: a run as panels you read.
 *
 * Logs are hard to read because everything is a line and every line looks the
 * same. A storyboard gives each story a panel — title, what happened as plain
 * sentences, how it ended — in the order things happened, with chapters as
 * sub-scenes indented under the beat that started them and the gap between
 * panels labelled with how much later the next one began. Uniform widths, no
 * axis to decode: the shape of a run at a glance. Any beat that carries data
 * or an error unfolds in place to the raw payload, stack and cause chain, so
 * digging in never means leaving the board.
 *
 * HTML rather than SVG, so text wraps, it reflows on a phone, and everything
 * is a text node like the rest of the package.
 */
import { buildStoryMap, type MapNode } from "./map";
import { renderError, renderValue, type RenderOptions } from "./render";
import { formatDuration, formatTime, parseTime } from "./time";
import type { Level, NoteRecord, StoryRecord } from "./types";

export type StoryboardOptions = RenderOptions & {
  /** Called when a panel is activated — for opening the full story view elsewhere */
  onSelect?: (story: StoryRecord, node: MapNode) => void;
  /** Beats shown per panel before the rest fold behind "n more". Default 8. */
  maxBeats?: number;
  /** A heading for the board. Default: a one-line summary ("5 stories · 1 failed"). */
  title?: string;
};

const LEVEL_WORD: Record<Level, string> = { Information: "ok", Warning: "warn", Error: "failed" };

type Ctx = {
  doc: Document;
  options: StoryboardOptions;
  maxBeats: number;
};

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

/** "+2.4 s" from the story's first beat; "start" for the first */
function offset(from: number, iso: string): string {
  const at = parseTime(iso);
  if (!at) return "";
  const delta = at.getTime() - from;
  return delta <= 0 ? "start" : `+${formatDuration(delta)}`;
}

/** How a story ended, in one line */
function outcome(story: StoryRecord): { text: string; level: Level } {
  if (story.error?.message) return { text: story.error.message, level: "Error" };
  if (story.level === "Error") return { text: "failed", level: "Error" };
  if (story.level === "Warning") return { text: "finished with warnings", level: "Warning" };
  return { text: "finished", level: "Information" };
}

function hasDetail(note: NoteRecord): boolean {
  return note.who !== undefined || note.what !== undefined || note.where !== undefined || note.error !== undefined;
}

/** Render a run as a storyboard: one panel per story, chapters as sub-scenes, raw detail one click down */
export function renderStoryboard(stories: StoryRecord[], options: StoryboardOptions = {}): HTMLElement {
  const ctx: Ctx = { doc: resolveDocument(options), options, maxBeats: options.maxBeats ?? 8 };
  const map = buildStoryMap(stories);
  const board = el(ctx, "section", "stv-board");
  board.setAttribute("aria-label", "Storyboard");

  const failed = map.rows.filter((node) => node.failed).length;
  const warned = map.rows.filter((node) => !node.failed && node.story.level === "Warning").length;
  const summaryParts = [`${map.count} ${map.count === 1 ? "story" : "stories"}`];
  if (failed) summaryParts.push(`${failed} failed`);
  if (warned) summaryParts.push(`${warned} with warnings`);
  if (map.count && !failed && !warned) summaryParts.push("all fine");
  const head = el(ctx, "header", "stv-board-head");
  head.dataset["state"] = failed ? "failed" : warned ? "warned" : "fine";
  head.append(el(ctx, "span", "stv-board-summary", options.title ?? summaryParts.join(" · ")));
  if (map.count) {
    head.append(el(ctx, "span", "stv-board-span", `${formatTime(options.locale, options.timeZone, new Date(map.start).toISOString())} · ${formatDuration(Math.max(0, map.end - map.start))}`));
  }
  board.append(head);

  if (!map.count) {
    board.append(el(ctx, "p", "stv-board-empty", "Nothing to show yet."));
    return board;
  }

  const strip = el(ctx, "ol", "stv-board-strip");
  let previousEnd: number | undefined;
  for (const root of map.roots) {
    if (previousEnd !== undefined) {
      const gap = root.start - previousEnd;
      const between = el(ctx, "li", "stv-board-gap");
      between.setAttribute("aria-hidden", "true");
      between.append(el(ctx, "span", "stv-board-gap-label", gap > 0 ? `${formatDuration(gap)} later` : "meanwhile"));
      strip.append(between);
    }
    const item = el(ctx, "li", "stv-board-item");
    item.append(renderPanel(ctx, root));
    strip.append(item);
    previousEnd = Math.max(previousEnd ?? 0, root.end);
  }
  board.append(strip);
  return board;
}

function renderPanel(ctx: Ctx, node: MapNode): HTMLElement {
  const { story } = node;
  const panel = el(ctx, "article", "stv-panel");
  panel.dataset["level"] = story.level;
  panel.dataset["depth"] = String(node.depth);
  panel.dataset["storyId"] = node.id;
  if (node.orphan) panel.dataset["orphan"] = "true";
  if (node.failed) panel.dataset["failed"] = "true";

  // Header: the title, and one word for how it went
  const head = el(ctx, "header", "stv-panel-head");
  const level = el(ctx, "span", "stv-panel-level", LEVEL_WORD[story.level]);
  level.dataset["level"] = story.level;
  head.append(el(ctx, "h4", "stv-panel-title", story.title), level);
  panel.append(head);

  // Beats as sentences with a small "when"; chapters indented under the beat that started them
  const notes = [...story.notes]
    .map((note, index) => ({ note, index, key: note.sequence ?? index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((entry) => entry.note);
  const chaptersByBeat = new Map<number, MapNode[]>();
  for (const child of node.children) {
    let at = -1;
    notes.forEach((note, index) => {
      const time = parseTime(note.timestamp)?.getTime() ?? Infinity;
      if (time <= child.start) at = index;
    });
    const bucket = chaptersByBeat.get(at) ?? [];
    bucket.push(child);
    chaptersByBeat.set(at, bucket);
  }
  const list = el(ctx, "ol", "stv-panel-beats");
  for (const child of chaptersByBeat.get(-1) ?? []) list.append(renderChapter(ctx, child));
  const shown = notes.slice(0, ctx.maxBeats);
  shown.forEach((note, index) => {
    list.append(renderBeat(ctx, note, node.start));
    for (const child of chaptersByBeat.get(index) ?? []) list.append(renderChapter(ctx, child));
  });
  if (notes.length > shown.length) {
    const rest = notes.length - shown.length;
    list.append(el(ctx, "li", "stv-panel-more", `${rest} more ${rest === 1 ? "beat" : "beats"}`));
    for (let index = shown.length; index < notes.length; index++) {
      for (const child of chaptersByBeat.get(index) ?? []) list.append(renderChapter(ctx, child));
    }
  }
  panel.append(list);

  // Footer: how it ended, and where it came from
  const end = outcome(story);
  const foot = el(ctx, "footer", "stv-panel-foot");
  const ended = el(ctx, "span", "stv-panel-outcome", end.text);
  ended.dataset["level"] = end.level;
  foot.append(ended);
  const meta: string[] = [];
  if (node.lane !== "stories") meta.push(node.lane);
  if (story.durationMs !== undefined) meta.push(formatDuration(story.durationMs));
  if (story.droppedEmissions) meta.push(`${story.droppedEmissions} beats dropped`);
  if (node.orphan) meta.push("parent not shown");
  if (meta.length) foot.append(el(ctx, "span", "stv-panel-meta", meta.join(" · ")));
  if (story.error && (story.error.stack || story.error.cause !== undefined || story.error.errors)) {
    const raw = el(ctx, "details", "stv-panel-raw");
    raw.append(el(ctx, "summary", "stv-panel-raw-summary", "the error"));
    raw.append(renderError(story.error, ctx.options));
    foot.append(raw);
  }
  panel.append(foot);

  if (ctx.options.onSelect) {
    const select = () => ctx.options.onSelect!(story, node);
    const open = el(ctx, "button", "stv-panel-open", "open");
    open.type = "button";
    open.setAttribute("aria-label", `Open ${story.title}`);
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      select();
    });
    head.append(open);
    panel.dataset["selectable"] = "true";
  }
  return panel;
}

/** One beat: a sentence with its "when". With data or an error attached, it unfolds to the raw detail. */
function renderBeat(ctx: Ctx, note: NoteRecord, start: number): HTMLElement {
  const failed = note.level === "Error" || note.error !== undefined;
  const level: Level = failed ? "Error" : (note.level ?? "Information");
  const line = el(ctx, "span", "stv-panel-line");
  line.append(el(ctx, "span", "stv-panel-when", offset(start, note.timestamp)), el(ctx, "span", "stv-panel-text", note.note));
  if (note.error?.message && note.error.message !== note.note) line.append(el(ctx, "span", "stv-panel-reason", note.error.message));

  if (!hasDetail(note)) {
    const beat = el(ctx, "li", "stv-panel-beat");
    beat.dataset["level"] = level;
    beat.append(line);
    return beat;
  }

  const beat = el(ctx, "li", "stv-panel-beat stv-panel-beat-detailed");
  beat.dataset["level"] = level;
  const details = el(ctx, "details", "stv-panel-unfold");
  const summary = el(ctx, "summary", "stv-panel-summary");
  summary.append(line);
  details.append(summary);
  const raw = el(ctx, "div", "stv-panel-detail");
  for (const key of ["who", "what", "where"] as const) {
    const value = note[key];
    if (value === undefined) continue;
    const block = el(ctx, "div", "stv-panel-context");
    block.append(el(ctx, "span", "stv-key", key), renderValue(value, { ...ctx.options, expandDepth: ctx.options.expandDepth ?? 2 }));
    raw.append(block);
  }
  if (note.error) raw.append(renderError(note.error, ctx.options));
  details.append(raw);
  beat.append(details);
  return beat;
}

function renderChapter(ctx: Ctx, child: MapNode): HTMLElement {
  const holder = el(ctx, "li", "stv-panel-chapter");
  holder.append(renderPanel(ctx, child));
  return holder;
}
