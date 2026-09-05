/**
 * DOM rendering for stories and notes.
 *
 * Every piece of story content reaches the page as a text node. Notes carry
 * user input, URLs and stack traces, so nothing here ever assigns innerHTML.
 */
import {
  circularPath,
  describeTruncation,
  isObject,
  isTruncationOnly,
  REDACTED,
  truncatedString,
  truncation,
  typeTag,
} from "./markers";
import { formatDuration, formatTime, parseTime } from "./time";
import type { ErrorRecord, JsonValue, Level, NoteRecord, StoryRecord } from "./types";

export type RenderOptions = {
  /** The document to create elements in. Required outside a browser (jsdom, SSR). */
  document?: Document;
  /** How many levels of nested values start expanded. Default 1. */
  expandDepth?: number;
  /** BCP 47 locale for times. Defaults to the runtime's. */
  locale?: string;
  /** IANA time zone for times. Defaults to the runtime's. */
  timeZone?: string;
  /** Show story ids and note sequence numbers. Default true. */
  showIds?: boolean;
};

type Resolved = {
  doc: Document;
  expandDepth: number;
  locale: string | undefined;
  timeZone: string | undefined;
  showIds: boolean;
};

const LEVEL_LABEL: Record<Level, string> = {
  Information: "info",
  Warning: "warn",
  Error: "error",
};

function resolve(options: RenderOptions): Resolved {
  const doc = options.document ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc) {
    throw new Error(
      "storyteller-view: no document available. Pass { document } when rendering outside a browser."
    );
  }
  return {
    doc,
    expandDepth: options.expandDepth ?? 1,
    locale: options.locale,
    timeZone: options.timeZone,
    showIds: options.showIds ?? true,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  r: Resolved,
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = r.doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function levelBadge(r: Resolved, level: Level): HTMLSpanElement {
  const badge = el(r, "span", "stv-level", LEVEL_LABEL[level]);
  badge.dataset["level"] = level;
  return badge;
}

/* ---------- time ---------- */

function timeElement(r: Resolved, iso: string, label: string): HTMLTimeElement {
  const time = el(r, "time", "stv-time", label);
  time.dateTime = iso;
  time.title = iso;
  return time;
}

/* ---------- values ---------- */

function isComposite(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null;
}

function renderPrimitive(r: Resolved, value: string | number | boolean | null): HTMLElement {
  if (value === null) return el(r, "span", "stv-null", "null");
  if (typeof value === "number") return el(r, "span", "stv-number", String(value));
  if (typeof value === "boolean") return el(r, "span", "stv-boolean", String(value));

  const path = circularPath(value);
  if (path !== undefined) {
    const ref = el(r, "span", "stv-circular", `circular, same as ${path}`);
    ref.dataset["path"] = path;
    return ref;
  }
  if (value === REDACTED) return el(r, "span", "stv-redacted", "redacted");

  const cut = truncatedString(value);
  if (cut) {
    const wrapper = el(r, "span", "stv-string");
    wrapper.append(cut.kept, el(r, "span", "stv-truncated", `${cut.omitted} more characters not kept`));
    return wrapper;
  }
  return el(r, "span", "stv-string", value);
}

function truncationNode(r: Resolved, value: { [key: string]: JsonValue }): HTMLElement | undefined {
  const marker = truncation(value);
  if (!marker) return undefined;
  const node = el(r, "span", "stv-truncated", describeTruncation(marker));
  node.dataset["kind"] = marker.kind;
  return node;
}

function summaryFor(r: Resolved, key: string | undefined, value: JsonValue[] | { [key: string]: JsonValue }): HTMLElement {
  const summary = el(r, "summary", "stv-summary");
  if (key !== undefined) summary.append(el(r, "span", "stv-key", key));
  if (Array.isArray(value)) {
    summary.append(el(r, "span", "stv-shape", `[${value.length}]`));
    return summary;
  }
  const tag = typeTag(value);
  if (tag) summary.append(el(r, "span", "stv-type", tag));
  const count = Object.keys(value).filter((k) => k !== "@type" && k !== "@truncated").length;
  summary.append(el(r, "span", "stv-shape", `{${count}}`));
  return summary;
}

function renderComposite(
  r: Resolved,
  value: JsonValue[] | { [key: string]: JsonValue },
  depth: number,
  key?: string
): HTMLElement {
  if (!Array.isArray(value) && isTruncationOnly(value)) {
    const only = truncationNode(r, value)!;
    if (key === undefined) return only;
    const line = el(r, "span", "stv-inline");
    line.append(el(r, "span", "stv-key", key), only);
    return line;
  }

  const tree = el(r, "details", "stv-tree");
  tree.open = depth < r.expandDepth;
  tree.append(summaryFor(r, key, value));
  const list = el(r, "ul", "stv-entries");

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (isObject(item) && isTruncationOnly(item)) {
        const li = el(r, "li", "stv-entry stv-entry-marker");
        li.append(truncationNode(r, item)!);
        list.append(li);
        return;
      }
      list.append(renderEntry(r, String(index), item, depth + 1));
    });
  } else {
    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === "@type" || childKey === "@truncated") continue;
      list.append(renderEntry(r, childKey, child, depth + 1));
    }
    const marker = truncationNode(r, value);
    if (marker) {
      const li = el(r, "li", "stv-entry stv-entry-marker");
      li.append(marker);
      list.append(li);
    }
  }

  tree.append(list);
  return tree;
}

function renderEntry(r: Resolved, key: string, value: JsonValue, depth: number): HTMLLIElement {
  const li = el(r, "li", "stv-entry");
  if (isComposite(value)) {
    li.append(renderComposite(r, value, depth, key));
  } else {
    li.append(el(r, "span", "stv-key", key), renderPrimitive(r, value));
  }
  return li;
}

/** Render any normalized value as a collapsible tree (or a single primitive) */
export function renderValue(value: JsonValue, options: RenderOptions = {}): HTMLElement {
  const r = resolve(options);
  return isComposite(value) ? renderComposite(r, value, 0) : renderPrimitive(r, value);
}

/** A labelled context value: who / what / where */
function renderContext(r: Resolved, label: string, value: JsonValue): HTMLElement {
  const block = el(r, "div", "stv-context");
  block.dataset["context"] = label;
  if (isComposite(value)) {
    block.append(renderComposite(r, value, 0, label));
  } else {
    block.append(el(r, "span", "stv-key", label), renderPrimitive(r, value));
  }
  return block;
}

/* ---------- errors ---------- */

function looksLikeError(value: JsonValue): value is { [key: string]: JsonValue } {
  return (
    isObject(value) &&
    !isTruncationOnly(value) &&
    (typeof value["message"] === "string" || typeof value["name"] === "string")
  );
}

/** Render a normalized error with its stack, cause chain and aggregate members */
export function renderError(error: ErrorRecord, options: RenderOptions = {}): HTMLElement {
  return renderErrorWith(resolve(options), error);
}

function renderErrorWith(r: Resolved, error: ErrorRecord): HTMLElement {
  const block = el(r, "div", "stv-error");
  const head = el(r, "div", "stv-error-head");
  head.append(el(r, "span", "stv-error-name", error.name ?? "Error"));
  if (error.message !== undefined) head.append(el(r, "span", "stv-error-message", error.message));
  block.append(head);

  if (error.stack) {
    const stack = el(r, "details", "stv-stack");
    stack.append(el(r, "summary", "stv-summary", "stack"));
    stack.append(el(r, "pre", "stv-pre", error.stack));
    block.append(stack);
  }

  if (error.cause !== undefined) {
    const cause = el(r, "div", "stv-cause");
    cause.append(el(r, "span", "stv-cause-label", "caused by"));
    if (looksLikeError(error.cause)) {
      cause.append(renderErrorWith(r, error.cause as ErrorRecord));
    } else if (isObject(error.cause) && isTruncationOnly(error.cause)) {
      cause.append(truncationNode(r, error.cause)!);
    } else if (isComposite(error.cause)) {
      cause.append(renderComposite(r, error.cause, 0));
    } else {
      cause.append(renderPrimitive(r, error.cause));
    }
    block.append(cause);
  }

  if (error.errors && error.errors.length) {
    const members = el(r, "ul", "stv-errors");
    for (const member of error.errors) {
      const li = el(r, "li", "stv-entry");
      li.append(renderErrorWith(r, member));
      members.append(li);
    }
    block.append(members);
  }
  return block;
}

/* ---------- notes ---------- */

function fillNote(r: Resolved, node: HTMLElement, note: NoteRecord, storyStart: Date | undefined): void {
  const level = note.level ?? "Information";
  node.dataset["level"] = level;
  if (note.sequence !== undefined) node.dataset["sequence"] = String(note.sequence);

  const head = el(r, "div", "stv-note-head");
  if (r.showIds && note.sequence !== undefined) head.append(el(r, "span", "stv-seq", `#${note.sequence}`));
  if (level !== "Information") head.append(levelBadge(r, level));

  const at = parseTime(note.timestamp);
  const label =
    storyStart && at ? `+${formatDuration(at.getTime() - storyStart.getTime())}` : formatTime(r.locale, r.timeZone, note.timestamp);
  head.append(timeElement(r, note.timestamp, label));
  head.append(el(r, "span", "stv-text", note.note));
  node.append(head);

  for (const key of ["who", "what", "where"] as const) {
    const value = note[key];
    if (value !== undefined) node.append(renderContext(r, key, value));
  }
  if (note.error) node.append(renderErrorWith(r, note.error));
}

/** Render one note on its own — a live emission, or a note pulled out of a story */
export function renderNote(note: NoteRecord, options: RenderOptions = {}): HTMLElement {
  const r = resolve(options);
  const node = el(r, "article", "stv-note");
  if (note.storyId && r.showIds) node.dataset["storyId"] = note.storyId;
  fillNote(r, node, note, undefined);
  return node;
}

/* ---------- stories ---------- */

function orderedNotes(notes: NoteRecord[]): NoteRecord[] {
  return notes
    .map((note, index) => ({ note, index, key: note.sequence ?? index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((entry) => entry.note);
}

/** Render a whole story: header, origin, the notes in sequence, and the closing error */
export function renderStory(story: StoryRecord, options: RenderOptions = {}): HTMLElement {
  const r = resolve(options);
  const root = el(r, "article", "stv-story");
  root.dataset["level"] = story.level;
  if (story.storyId) root.dataset["storyId"] = story.storyId;

  const header = el(r, "div", "stv-story-head");
  const titleRow = el(r, "div", "stv-title-row");
  titleRow.append(levelBadge(r, story.level), el(r, "div", "stv-title", story.title));
  header.append(titleRow);

  const meta = el(r, "div", "stv-meta");
  meta.append(timeElement(r, story.timestamp, formatTime(r.locale, r.timeZone, story.timestamp)));
  if (story.durationMs !== undefined) meta.append(el(r, "span", "stv-duration", formatDuration(story.durationMs)));
  meta.append(el(r, "span", "stv-count", `${story.notes.length} ${story.notes.length === 1 ? "note" : "notes"}`));
  if (story.droppedEmissions) {
    meta.append(el(r, "span", "stv-dropped", `${story.droppedEmissions} dropped`));
  }
  if (r.showIds && story.storyId) meta.append(el(r, "code", "stv-id", story.storyId));
  if (r.showIds && story.parentStoryId) {
    const parent = el(r, "code", "stv-parent", `chapter of ${story.parentStoryId}`);
    parent.dataset["parentStoryId"] = story.parentStoryId;
    meta.append(parent);
  }
  header.append(meta);

  if (story.origin) {
    const origin = el(r, "div", "stv-origin");
    for (const key of ["who", "what", "where"] as const) {
      const value = story.origin[key];
      if (value !== undefined) origin.append(renderContext(r, key, value));
    }
    if (origin.childElementCount) header.append(origin);
  }
  root.append(header);

  const notes = orderedNotes(story.notes);
  const start = notes[0] ? parseTime(notes[0].timestamp) : undefined;
  const list = el(r, "ol", "stv-notes");
  for (const note of notes) {
    const item = el(r, "li", "stv-note");
    fillNote(r, item, note, start);
    list.append(item);
  }
  root.append(list);

  if (story.error) {
    const closing = el(r, "div", "stv-story-error");
    closing.append(renderErrorWith(r, story.error));
    root.append(closing);
  }
  return root;
}
