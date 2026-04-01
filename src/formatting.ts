import type {
  StoryEventBase,
  StoryNote,
  StorySummaryNote,
  StorySummaryData,
  StorySummary,
  StorySummaryOptions,
} from "./storyteller";
import { ANSI, getLevelColor, formatOrigin, colorizeJsonSections } from "./utils";

/** Generate a formatted, human-readable report from a story event */
export function summarizeStory(
  story: StoryEventBase,
  options: StorySummaryOptions = {}
): StorySummary {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotes = 50,
    showData = true,
    colorize = true,
  } = options;

  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  // Notes are already sorted if coming from buildEvent; sort again for standalone use
  const orderedNotes = [...story.notes].sort(
    (noteA, noteB) => Date.parse(noteA.timestamp) - Date.parse(noteB.timestamp)
  );

  // Use pre-computed durationMs from the event if available, otherwise compute
  const durationMs = story.durationMs ?? calculateNoteDuration(orderedNotes);
  const duration = durationMs != null ? formatDuration(durationMs) : undefined;

  const slicedNotes = orderedNotes.slice(0, maxNotes);
  const summaryNotes: StorySummaryNote[] = slicedNotes.map((note) => ({
    timestamp: note.timestamp,
    when: timeFormatter.format(new Date(note.timestamp)),
    note: note.note,
    text: formatNoteText(note, verbosity),
    ...(note.who ? { who: note.who } : {}),
    ...(note.what ? { what: note.what } : {}),
    ...(note.where ? { where: note.where } : {}),
    ...(note.error ? { error: note.error } : {}),
  }));

  const data: StorySummaryData = {
    title: story.title,
    level: story.level,
    when: dateTimeFormatter.format(new Date(story.timestamp)),
    ...(durationMs != null ? { durationMs } : {}),
    ...(duration ? { duration } : {}),
    ...(story.origin ? { origin: story.origin } : {}),
    notes: summaryNotes,
    ...(story.error ? { error: story.error } : {}),
  };

  const lines = buildSummaryText(story, data, summaryNotes, orderedNotes, {
    colorize,
    verbosity,
    showData,
    duration,
  });

  return { text: lines.join("\n"), data };
}

/** Build the human-readable text lines for a story summary */
function buildSummaryText(
  story: StoryEventBase,
  data: StorySummaryData,
  summaryNotes: StorySummaryNote[],
  orderedNotes: StoryNote[],
  options: { colorize: boolean; verbosity: string; showData: boolean; duration?: string | undefined }
): string[] {
  const levelColor = getLevelColor(story.level);
  const label = (text: string) =>
    options.colorize ? `${levelColor}${text}${ANSI.reset}` : text;
  const originLabel = formatOrigin(story.origin);

  const lines: string[] = [];
  lines.push(`${label("Story")}: ${story.title}`);
  lines.push(`${label("Level")}: ${story.level}`);
  lines.push(`${label("Time")}: ${data.when}${options.duration ? ` (${options.duration})` : ""}`);

  if (originLabel) {
    lines.push(`${label("Origin")}: ${originLabel}`);
  }

  if (story.error) {
    const errorLine = [story.error.name, story.error.message]
      .filter(Boolean)
      .join(": ");
    if (errorLine) lines.push(`${label("Error")}: ${errorLine}`);
  }

  if (options.verbosity !== "brief" && summaryNotes.length) {
    lines.push(`${label("Notes")}:`);
    for (const note of summaryNotes) {
      lines.push(`  ${note.when} — ${note.text}`);
    }
    if (orderedNotes.length > summaryNotes.length) {
      lines.push(`  … (${orderedNotes.length - summaryNotes.length} more)`);
    }
  }

  if (options.showData) {
    lines.push(`${label("Data")}:`);
    const json = JSON.stringify(data, null, 2);
    if (options.colorize) {
      const colored = colorizeJsonSections(json, {
        base: ANSI.grayLight,
        notes: ANSI.grayDark,
        reset: ANSI.reset,
      });
      lines.push(...colored);
    } else {
      lines.push(...json.split("\n"));
    }
  }

  return lines;
}

/** Calculate the duration between the first and last note in a sequence */
function calculateNoteDuration(notes: StoryNote[]): number | undefined {
  if (notes.length <= 1) return undefined;

  const startTime = Date.parse(notes[0]!.timestamp);
  const endTime = Date.parse(notes[notes.length - 1]!.timestamp);

  return Number.isFinite(startTime) && Number.isFinite(endTime)
    ? Math.max(0, endTime - startTime)
    : undefined;
}

/** Convert milliseconds into a human-readable duration string */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainingSeconds}m`;
}

/** Format a note's text with optional context details when verbosity is "full" */
function formatNoteText(
  note: StoryNote,
  verbosity: "brief" | "normal" | "full"
): string {
  if (verbosity !== "full") return note.note;

  const details: string[] = [];
  const what = note.what;
  const where = note.where;

  if (typeof what === "string") {
    details.push(`what=${what}`);
  } else if (what) {
    for (const [key, value] of Object.entries(what)) {
      if (value != null) details.push(`${key}=${String(value)}`);
    }
  }
  if (typeof where === "string") {
    details.push(`where=${where}`);
  } else if (where) {
    for (const [key, value] of Object.entries(where)) {
      if (value != null) details.push(`${key}=${String(value)}`);
    }
  }
  if (note.error) {
    const errorLine = [note.error.name, note.error.message]
      .filter(Boolean)
      .join(": ");
    if (errorLine) details.push(`error=${errorLine}`);
  }

  return details.length
    ? `${note.note} (${details.join(" ")})`
    : note.note;
}
