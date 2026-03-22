import type { StoryEventBase, StoryLevel } from "./storyteller";

/** ANSI escape codes for terminal colorization */
export const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[38;2;250;128;114m",
  grayLight: "\x1b[37m",
  grayDark: "\x1b[37m",
};

/** Maps a story level to its ANSI terminal color */
export function getLevelColor(level: StoryLevel): string {
  if (level === "tell") return ANSI.green;
  if (level === "warn") return ANSI.yellow;
  return ANSI.red;
}

/** Formats an origin context into a human-readable path string */
export function formatOrigin(origin?: StoryEventBase["origin"]): string | undefined {
  if (!origin?.where) return;
  if (typeof origin.where === "string") return origin.where;
  const w = origin.where as Record<string, unknown>;
  const parts = [w.app, w.service, w.page, w.component]
    .filter(Boolean)
    .map(String);
  return parts.length ? parts.join(" / ") : undefined;
}

/** Colorizes JSON output, dimming the notes section for readability */
export function colorizeJsonSections(
  json: string,
  colors: { base: string; notes: string; reset: string }
): string[] {
  const lines = json.split("\n");
  let inNotes = false;
  let notesDepth = 0;

  return lines.map((line) => {
    if (!inNotes && line.includes('"notes": [')) {
      inNotes = true;
      notesDepth = countBrackets(line);
      return `${colors.notes}${line}${colors.reset}`;
    }

    if (inNotes) {
      const colored = `${colors.notes}${line}${colors.reset}`;
      notesDepth += countBrackets(line);
      if (notesDepth <= 0) inNotes = false;
      return colored;
    }

    return `${colors.base}${line}${colors.reset}`;
  });
}

/** Counts net bracket depth change in a line (opens minus closes) */
export function countBrackets(line: string): number {
  const open = (line.match(/\[/g) || []).length;
  const close = (line.match(/\]/g) || []).length;
  return open - close;
}
