import type {
  StoryEventBase,
  StoryNote,
  ReportNote,
  StoryReport,
  FormattedReport,
  ReportOptions,
} from "./storyteller";
import { ANSI, getLevelColor, formatOrigin, colorizeJsonSections } from "./utils";

/**
 * Format a story event into a human-readable report with optional colors.
 *
 * @param story - The story event to format
 * @param options - Formatting options (timezone, locale, detail level, colors)
 * @returns A FormattedReport with both text (for display) and data (structured)
 *
 * @example
 * ```ts
 * const report = formatStory(event, { colors: false, detail: "brief" });
 * console.log(report.text);
 * ```
 */
export function formatStory(
  story: StoryEventBase,
  options: ReportOptions = {}
): FormattedReport {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    detail = "normal",
    noteLimit = 50,
    showData = true,
    colors = true,
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

  const slicedNotes = orderedNotes.slice(0, noteLimit);
  const reportNotes: ReportNote[] = slicedNotes.map((note) => ({
    timestamp: note.timestamp,
    when: timeFormatter.format(new Date(note.timestamp)),
    note: note.note,
    text: formatNoteText(note, detail),
    ...(note.who ? { who: note.who } : {}),
    ...(note.what ? { what: note.what } : {}),
    ...(note.where ? { where: note.where } : {}),
    ...(note.error ? { error: note.error } : {}),
  }));

  const data: StoryReport = {
    title: story.title,
    level: story.level,
    when: dateTimeFormatter.format(new Date(story.timestamp)),
    ...(durationMs != null ? { durationMs } : {}),
    ...(duration ? { duration } : {}),
    ...(story.origin ? { origin: story.origin } : {}),
    notes: reportNotes,
    ...(story.error ? { error: story.error } : {}),
  };

  const lines = buildReportText(story, data, reportNotes, orderedNotes, {
    colors,
    detail,
    showData,
    duration,
  });

  return { text: lines.join("\n"), data };
}

/** Build the human-readable text lines for a story report */
function buildReportText(
  story: StoryEventBase,
  data: StoryReport,
  reportNotes: ReportNote[],
  orderedNotes: StoryNote[],
  options: { colors: boolean; detail: string; showData: boolean; duration?: string | undefined }
): string[] {
  const levelColor = getLevelColor(story.level);
  const label = (text: string) =>
    options.colors ? `${levelColor}${text}${ANSI.reset}` : text;
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

  if (options.detail !== "brief" && reportNotes.length) {
    lines.push(`${label("Notes")}:`);
    for (const note of reportNotes) {
      lines.push(`  ${note.when} — ${note.text}`);
    }
    if (orderedNotes.length > reportNotes.length) {
      lines.push(`  … (${orderedNotes.length - reportNotes.length} more)`);
    }
  }

  if (options.showData) {
    lines.push(`${label("Data")}:`);
    const json = JSON.stringify(data, null, 2);
    if (options.colors) {
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

/** @deprecated Use formatStory instead */
export const summarizeStory = formatStory;

/** Format a note's text with optional context details when detail level is "full" */
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
