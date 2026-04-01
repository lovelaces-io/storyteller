import type { StoryEventBase, StoryLevel } from "./storyteller";

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
  if (level === "tell") return ANSI.green;
  if (level === "warn") return ANSI.yellow;
  return ANSI.red;
}

/** Format an origin context into a human-readable path like "app / page / component" */
export function formatOrigin(origin?: StoryEventBase["origin"]): string | undefined {
  if (!origin?.where) return;
  if (typeof origin.where === "string") return origin.where;
  const whereRecord = origin.where as Record<string, unknown>;

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
