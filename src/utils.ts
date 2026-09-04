import type { StoryError, StoryLevel, StoryOrigin } from "./storyteller";
import type { JsonValue } from "./normalize";

/** ANSI escape codes for terminal colorization */
export const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[38;2;250;128;114m",
  grayLight: "\x1b[37m",
  grayDark: "\x1b[90m",
};

/** Map a story level to its corresponding ANSI terminal color */
export function getLevelColor(level: StoryLevel): string {
  if (level === "Information") return ANSI.green;
  if (level === "Warning") return ANSI.yellow;
  return ANSI.red;
}

/** Format an origin context into a human-readable path like "app / page / component" */
export function formatOrigin(origin?: StoryOrigin): string | undefined {
  if (!origin?.where) return;
  if (typeof origin.where === "string") return origin.where;
  if (typeof origin.where !== "object" || Array.isArray(origin.where)) {
    return String(origin.where);
  }
  const whereRecord: Record<string, JsonValue> = origin.where;

  // Show well-known keys first in a natural order, then any additional fields
  const priorityKeys = ["app", "service", "page", "component"];
  const priorityParts = priorityKeys
    .filter((key) => whereRecord[key] != null)
    .map((key) => String(whereRecord[key]));
  const extraParts = Object.entries(whereRecord)
    .filter(([key, value]) => !priorityKeys.includes(key) && value != null)
    .map(([_, value]) => String(value));

  const parts = [...priorityParts, ...extraParts];
  return parts.length ? parts.join(" / ") : undefined;
}

/** Colorize JSON output, dimming the notes section for visual hierarchy */
export function colorizeJsonSections(
  json: string,
  colors: { base: string; notes: string; reset: string }
): string[] {
  const lines = json.split("\n");
  let insideNotes = false;
  let bracketDepth = 0;

  return lines.map((line) => {
    if (!insideNotes && line.includes('"notes": [')) {
      insideNotes = true;
      bracketDepth = countBrackets(line);
      return `${colors.notes}${line}${colors.reset}`;
    }

    if (insideNotes) {
      const colored = `${colors.notes}${line}${colors.reset}`;
      bracketDepth += countBrackets(line);
      if (bracketDepth <= 0) insideNotes = false;
      return colored;
    }

    return `${colors.base}${line}${colors.reset}`;
  });
}

/** Count the net bracket depth change in a line (opening brackets minus closing brackets) */
export function countBrackets(line: string): number {
  const openCount = (line.match(/\[/g) || []).length;
  const closeCount = (line.match(/\]/g) || []).length;
  return openCount - closeCount;
}

/** How much of a single note's context to show on one console line */
const CONTEXT_LINE_LIMIT = 120;

/**
 * Condense a note's context into a short inline summary for one-line output.
 * The full values are always available on the story record and the NDJSON stream,
 * so this can afford to be lossy in favor of staying readable.
 *
 * @param note - The note's context fields
 * @returns A brace-wrapped summary, or undefined when there is no context
 */
export function summarizeContext(note: {
  note?: string;
  what?: JsonValue;
  where?: JsonValue;
  error?: StoryError;
}): string | undefined {
  const parts: string[] = [];

  appendContextParts(parts, note.what);
  appendContextParts(parts, note.where);

  if (note.error) {
    const errorLine = [note.error.name, note.error.message].filter(Boolean).join(": ");
    // Skip it when the note text was derived from this error — repeating it reads as noise
    if (errorLine && errorLine !== note.note) parts.push(errorLine);
  }

  if (!parts.length) return undefined;

  const joined = parts.join(" ");
  const text = joined.length > CONTEXT_LINE_LIMIT
    ? `${joined.slice(0, CONTEXT_LINE_LIMIT)}…`
    : joined;

  return `{${text}}`;
}

/** Flatten one context value into `key=value` fragments */
function appendContextParts(parts: string[], value?: JsonValue) {
  if (value == null) return;

  if (typeof value !== "object") {
    parts.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    parts.push(`[${value.length}]`);
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (entry == null) continue;
    if (key.startsWith("@")) continue;
    parts.push(`${key}=${typeof entry === "object" ? summarizeNested(entry) : String(entry)}`);
  }
}

/** Render a nested context value as a size hint rather than expanding it inline */
function summarizeNested(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).length}}`;
  return String(value);
}
