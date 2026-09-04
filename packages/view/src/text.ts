/**
 * Text rendering for consoles and agent transcripts.
 *
 * Same layout as the DOM renderer, as indented lines: header, origin, notes in
 * sequence with offsets, context as a folded tree, errors with their cause
 * chain, and every normalizer marker in words. Colors are opt-in ANSI.
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

export type TextOptions = {
  /** Emit ANSI color codes. Default false. */
  colors?: boolean;
  /** Include stack traces. Default true. */
  stacks?: boolean;
  /** Levels of nested values printed in full before folding to their shape. Default 4. */
  maxDepth?: number;
  /** Spaces per indent level. Default 2. */
  indent?: number;
  /** BCP 47 locale for times. Defaults to the runtime's. */
  locale?: string;
  /** IANA time zone for times. Defaults to the runtime's. */
  timeZone?: string;
  /** Show story ids and note sequence numbers. Default true. */
  showIds?: boolean;
};

type Resolved = {
  colors: boolean;
  stacks: boolean;
  maxDepth: number;
  indent: number;
  locale: string | undefined;
  timeZone: string | undefined;
  showIds: boolean;
};

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[38;2;250;128;114m",
  cyan: "\x1b[36m",
};

const LEVEL: Record<Level, { word: string; color: string }> = {
  Information: { word: "INFO", color: ANSI.green },
  Warning: { word: "WARN", color: ANSI.yellow },
  Error: { word: "ERROR", color: ANSI.red },
};

/** Entries at or under this count, all primitive, print on one line */
const INLINE_ENTRIES = 4;
const INLINE_WIDTH = 72;

// Built from the character code so the lint rule against control characters in
// regex literals stays on for the rest of the package.
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Remove ANSI color codes from rendered text */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function resolve(options: TextOptions): Resolved {
  return {
    colors: options.colors ?? false,
    stacks: options.stacks ?? true,
    maxDepth: options.maxDepth ?? 4,
    indent: options.indent ?? 2,
    locale: options.locale,
    timeZone: options.timeZone,
    showIds: options.showIds ?? true,
  };
}

function paint(r: Resolved, code: string, text: string): string {
  return r.colors ? `${code}${text}${ANSI.reset}` : text;
}

function pad(r: Resolved, level: number): string {
  return " ".repeat(level * r.indent);
}

function badge(r: Resolved, level: Level): string {
  const { word, color } = LEVEL[level];
  return paint(r, color, word);
}

/* ---------- values ---------- */

function isComposite(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null;
}

function primitive(r: Resolved, value: string | number | boolean | null): string {
  if (value === null) return paint(r, ANSI.gray, "null");
  if (typeof value !== "string") return paint(r, ANSI.cyan, String(value));

  const path = circularPath(value);
  if (path !== undefined) return paint(r, ANSI.gray, `circular, same as ${path}`);
  if (value === REDACTED) return paint(r, ANSI.yellow, "redacted");
  const cut = truncatedString(value);
  if (cut) return `${JSON.stringify(cut.kept)} ${paint(r, ANSI.gray, `(${cut.omitted} more characters not kept)`)}`;
  return JSON.stringify(value);
}

function marker(r: Resolved, value: { [key: string]: JsonValue }): string | undefined {
  const found = truncation(value);
  return found ? paint(r, ANSI.gray, `… ${describeTruncation(found)}`) : undefined;
}

function shape(r: Resolved, value: JsonValue[] | { [key: string]: JsonValue }): string {
  if (Array.isArray(value)) return paint(r, ANSI.gray, `[${value.length}]`);
  const tag = typeTag(value);
  const count = Object.keys(value).filter((k) => k !== "@type" && k !== "@truncated").length;
  return `${tag ? paint(r, ANSI.green, tag) + " " : ""}${paint(r, ANSI.gray, `{${count}}`)}`;
}

function entries(value: JsonValue[] | { [key: string]: JsonValue }): [string, JsonValue][] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  return Object.entries(value).filter(([key]) => key !== "@type" && key !== "@truncated");
}

/** One-line form for a small, flat composite; undefined when it needs lines */
function inline(r: Resolved, value: JsonValue[] | { [key: string]: JsonValue }): string | undefined {
  const items = entries(value);
  if (items.length > INLINE_ENTRIES) return undefined;
  if (items.some(([, child]) => isComposite(child))) return undefined;
  if (!Array.isArray(value) && (typeTag(value) || truncation(value))) return undefined;
  const parts = items.map(([key, child]) =>
    Array.isArray(value) ? primitive(r, child as string | number | boolean | null) : `${key}: ${primitive(r, child as string | number | boolean | null)}`
  );
  const text = Array.isArray(value) ? `[${parts.join(", ")}]` : `{${parts.join(", ")}}`;
  // Measure without color codes so painted values do not push flat objects onto many lines
  const visible = r.colors ? stripAnsi(text) : text;
  return visible.length <= INLINE_WIDTH ? text : undefined;
}

function valueLines(r: Resolved, key: string | undefined, value: JsonValue, depth: number, level: number): string[] {
  const prefix = key === undefined ? "" : `${paint(r, ANSI.gray, key + ":")} `;
  const line = (text: string) => `${pad(r, level)}${prefix}${text}`;

  if (!isComposite(value)) return [line(primitive(r, value))];
  if (!Array.isArray(value) && isTruncationOnly(value)) return [line(marker(r, value)!)];

  const flat = inline(r, value);
  if (flat !== undefined) return [line(flat)];
  if (depth >= r.maxDepth) return [line(`${shape(r, value)} ${paint(r, ANSI.gray, "…")}`)];

  const lines = [line(shape(r, value))];
  for (const [childKey, child] of entries(value)) {
    if (isObject(child) && isTruncationOnly(child)) {
      lines.push(`${pad(r, level + 1)}${marker(r, child)!}`);
      continue;
    }
    lines.push(...valueLines(r, childKey, child, depth + 1, level + 1));
  }
  if (!Array.isArray(value)) {
    const tail = marker(r, value);
    if (tail) lines.push(`${pad(r, level + 1)}${tail}`);
  }
  return lines;
}

/** Render any normalized value as indented text */
export function renderValueText(value: JsonValue, options: TextOptions = {}): string {
  return valueLines(resolve(options), undefined, value, 0, 0).join("\n");
}

/* ---------- errors ---------- */

function looksLikeError(value: JsonValue): value is { [key: string]: JsonValue } {
  return (
    isObject(value) &&
    !isTruncationOnly(value) &&
    (typeof value["message"] === "string" || typeof value["name"] === "string")
  );
}

function errorLines(r: Resolved, error: ErrorRecord, level: number, lead = ""): string[] {
  const name = paint(r, ANSI.red, error.name ?? "Error");
  const head = error.message !== undefined ? `${name}: ${error.message}` : name;
  const lines = [`${pad(r, level)}${lead}${head}`];

  if (r.stacks && error.stack) {
    const frames = error.stack.split("\n").map((frame) => frame.trim()).filter(Boolean);
    // The first stack line usually repeats "name: message"; keep only the frames
    const start = frames[0] && error.message !== undefined && frames[0].includes(error.message) ? 1 : 0;
    for (const frame of frames.slice(start)) lines.push(`${pad(r, level + 1)}${paint(r, ANSI.gray, frame)}`);
  }

  if (error.cause !== undefined) {
    const label = paint(r, ANSI.gray, "caused by") + " ";
    if (looksLikeError(error.cause)) {
      lines.push(...errorLines(r, error.cause as ErrorRecord, level + 1, label));
    } else if (isObject(error.cause) && isTruncationOnly(error.cause)) {
      lines.push(`${pad(r, level + 1)}${label}${marker(r, error.cause)!}`);
    } else {
      const [first, ...rest] = valueLines(r, undefined, error.cause, 0, level + 1);
      lines.push(`${pad(r, level + 1)}${label}${first!.trimStart()}`, ...rest);
    }
  }

  if (error.errors && error.errors.length) {
    error.errors.forEach((member, index) => {
      lines.push(...errorLines(r, member, level + 1, paint(r, ANSI.gray, `${index + 1}.`) + " "));
    });
  }
  return lines;
}

/** Render a normalized error with its stack, cause chain and aggregate members */
export function renderErrorText(error: ErrorRecord, options: TextOptions = {}): string {
  return errorLines(resolve(options), error, 0).join("\n");
}

/* ---------- notes ---------- */

function noteLines(r: Resolved, note: NoteRecord, start: Date | undefined, level: number): string[] {
  const head: string[] = [];
  if (r.showIds && note.sequence !== undefined) head.push(paint(r, ANSI.gray, `#${note.sequence}`));
  const at = parseTime(note.timestamp);
  head.push(
    paint(
      r,
      ANSI.gray,
      start && at ? `+${formatDuration(at.getTime() - start.getTime())}` : formatTime(r.locale, r.timeZone, note.timestamp)
    )
  );
  const noteLevel = note.level ?? "Information";
  if (noteLevel !== "Information") head.push(badge(r, noteLevel));
  head.push(note.note);

  const lines = [`${pad(r, level)}${head.join("  ")}`];
  for (const key of ["who", "what", "where"] as const) {
    const value = note[key];
    if (value !== undefined) lines.push(...valueLines(r, key, value, 0, level + 1));
  }
  if (note.error) lines.push(...errorLines(r, note.error, level + 1));
  return lines;
}

/** Render one note on its own — a live emission, or a note pulled out of a story */
export function renderNoteText(note: NoteRecord, options: TextOptions = {}): string {
  const r = resolve(options);
  const lines = noteLines(r, note, undefined, 0);
  if (r.showIds && note.storyId) lines[0] = `${lines[0]}  ${paint(r, ANSI.gray, note.storyId)}`;
  return lines.join("\n");
}

/* ---------- stories ---------- */

function orderedNotes(notes: NoteRecord[]): NoteRecord[] {
  return notes
    .map((note, index) => ({ note, index, key: note.sequence ?? index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((entry) => entry.note);
}

/** Render a whole story as indented text */
export function renderStoryText(story: StoryRecord, options: TextOptions = {}): string {
  const r = resolve(options);
  const lines: string[] = [];

  lines.push(`${badge(r, story.level)}  ${paint(r, ANSI.bold, story.title)}`);
  const meta = [formatTime(r.locale, r.timeZone, story.timestamp)];
  if (story.durationMs !== undefined) meta.push(formatDuration(story.durationMs));
  meta.push(`${story.notes.length} ${story.notes.length === 1 ? "note" : "notes"}`);
  if (story.droppedEmissions) meta.push(paint(r, ANSI.yellow, `${story.droppedEmissions} dropped`));
  if (r.showIds && story.storyId) meta.push(story.storyId);
  if (r.showIds && story.parentStoryId) meta.push(`chapter of ${story.parentStoryId}`);
  lines.push(`${pad(r, 1)}${paint(r, ANSI.gray, meta.join(" · "))}`);

  if (story.origin) {
    for (const key of ["who", "what", "where"] as const) {
      const value = story.origin[key];
      if (value !== undefined) lines.push(...valueLines(r, key, value, 0, 1));
    }
  }

  const notes = orderedNotes(story.notes);
  const start = notes[0] ? parseTime(notes[0].timestamp) : undefined;
  if (notes.length) lines.push("");
  for (const note of notes) lines.push(...noteLines(r, note, start, 1));

  if (story.error) {
    lines.push("");
    lines.push(...errorLines(r, story.error, 1));
  }
  return lines.join("\n");
}
