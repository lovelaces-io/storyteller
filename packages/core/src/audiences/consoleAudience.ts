import type { AudienceMember, Emission, EmissionKind, NoteEmission, StoryEvent, StoryLevel } from "../storyteller";
import { resolveColors } from "../environment";
import { ANSI, getLevelColor, formatOrigin, summarizeContext } from "../utils";

/** Short level labels for compact live output */
const LEVEL_LABELS: Record<StoryLevel, string> = {
  Information: "info",
  Warning: "warn",
  Error: "oops",
};

/** Browser console styles by level, used for the grouped story header */
const LEVEL_STYLES: Record<StoryLevel, string> = {
  Information: "color:#16a34a;font-weight:600",
  Warning: "color:#f59e0b;font-weight:600",
  Error: "color:#dc2626;font-weight:600",
};

export type ConsoleAudienceOptions = {
  /** Set false to strip ANSI colors from live note lines. Defaults to `STORYTELLER_COLOR`. */
  colors?: boolean;
};

/**
 * Create an audience that prints to the console: one compact line per note when
 * narration is live, and a color-coded grouped record when a story is told.
 *
 * Registered by default on every Storyteller instance. It listens for notes as well
 * as stories, so switching a storyteller to live narration shows something immediately
 * without registering anything extra.
 *
 * @param options - Rendering options for live note lines
 *
 * @example
 * ```ts
 * // Already included — but you can re-add after removing:
 * story.audience.add(consoleAudience());
 * ```
 */
export function consoleAudience(options: ConsoleAudienceOptions = {}): AudienceMember<EmissionKind> {
  const colors = resolveColors(options.colors);

  return {
    name: "console",
    hears: ["note", "story"],
    hear: (emission: Emission) => {
      if (emission.kind === "note") {
        printNote(emission, colors);
        return;
      }
      printStory(emission);
    },
  };
}

/**
 * Print a single beat as one line. Deliberately compact — at one emission per note,
 * a collapsed group and a pretty-printed payload per line is unreadable.
 */
function printNote(note: NoteEmission, colors: boolean) {
  const time = readClockTime(note.timestamp);
  const label = LEVEL_LABELS[note.level];
  const origin = formatOrigin(note.origin);
  const context = summarizeContext(note);

  const head = colors
    ? `${getLevelColor(note.level)}${label}${ANSI.reset}`
    : label;

  const line = [
    colors ? `${ANSI.grayDark}${time}${ANSI.reset}` : time,
    head,
    origin ? (colors ? `${ANSI.grayDark}${origin}${ANSI.reset}` : origin) : undefined,
    note.note,
    context ? (colors ? `${ANSI.grayDark}${context}${ANSI.reset}` : context) : undefined,
  ]
    .filter(Boolean)
    .join("  ");

  if (note.level === "Information") {
    console.log(line);
  } else if (note.level === "Warning") {
    console.warn(line);
  } else {
    console.error(line);
  }
}

/** Print a told story as a collapsed group with the full record inside */
function printStory(event: StoryEvent) {
  const prefix = "Storyteller";
  const header = `${prefix}: ${event.title}`;

  console.groupCollapsed(`%c${header}`, LEVEL_STYLES[event.level]);

  const payload = JSON.stringify(event, null, 2);

  if (event.level === "Information") {
    console.log(header, payload);
  } else if (event.level === "Warning") {
    console.warn(header, payload);
  } else {
    console.error(header, payload);
  }

  console.groupEnd();
}

/** Extract HH:MM:SS from an ISO timestamp without paying for Intl on every note */
function readClockTime(timestamp: string): string {
  const timePart = timestamp.slice(11, 19);
  return timePart.length === 8 ? timePart : timestamp;
}
