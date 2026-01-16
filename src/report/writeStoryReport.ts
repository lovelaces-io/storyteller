import type { StoryEventBase } from "../storyteller";
import { summarizeStory } from "../storyteller";

export type StoryReportOptions = {
  timezone?: string;
  locale?: string;
  verbosity?: "brief" | "normal" | "full";
  maxNotesPerStory?: number;
  showData?: boolean;
  colorize?: boolean;
};

export function writeStoryReport(
  stories: StoryEventBase[],
  opts: StoryReportOptions = {}
): string {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotesPerStory = 50,
    showData = true,
    colorize = true,
  } = opts;

  if (!stories.length) {
    return "Storyteller Report\n\n(no stories)\n";
  }

  const sorted = [...stories].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts)
  );

  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) {
    return "Storyteller Report\n\n(no stories)\n";
  }

  const lines: string[] = [];
  lines.push(`Storyteller Report (${timezone})`);
  lines.push(
    `Range: ${dateFmt.format(new Date(first.ts))} – ${dateFmt.format(
      new Date(last.ts)
    )}`
  );
  lines.push("");

  // Group by day
  const byDay = new Map<string, StoryEventBase[]>();
  for (const s of sorted) {
    const key = dateFmt.format(new Date(s.ts));
    const arr = byDay.get(key) ?? [];
    arr.push(s);
    byDay.set(key, arr);
  }

  for (const [day, dayStories] of byDay) {
    lines.push(day);

    for (const story of dayStories) {
      const summary = summarizeStory(story, {
        timezone,
        locale,
        verbosity,
        maxNotes: maxNotesPerStory,
        colorize,
      });
      const { data } = summary;
      const originLabel = formatOrigin(story.origin);
      const levelColor = getLevelColor(story.level);
      const label = (text: string) =>
        colorize ? `${levelColor}${text}${ANSI.reset}` : text;

      const duration = data.duration ? ` (${data.duration})` : "";
      lines.push(`${label("StorytellerSummary")}: ${story.title}`);
      lines.push(`${label("Time")}: ${data.when}${duration}`);

      if (originLabel) {
        lines.push(`${label("Origin")}: ${originLabel}`);
      }

      if (data.error) {
        const errLine = [
          data.error.name,
          data.error.message,
        ]
          .filter(Boolean)
          .join(": ");
        if (errLine) lines.push(`${label("?")}: ${errLine}`);
      }

      if (verbosity !== "brief" && data.notes.length) {
        lines.push(`  ${label("Notes")}:`);

        for (const n of data.notes) {
          lines.push(`    ${n.when} - ${n.text}`);
        }

        if (story.notes.length > data.notes.length) {
          lines.push(
            `    … (${story.notes.length - data.notes.length} more)`
          );
        }
      }

      if (showData) {
        lines.push(`${label("Story")}:`);
        const json = JSON.stringify(data, null, 2);
        if (colorize) {
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

      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

function formatOrigin(origin?: StoryEventBase["origin"]): string | undefined {
  if (!origin?.where) return;
  if (typeof origin.where === "string") return origin.where;
  const w = origin.where as Record<string, unknown>;
  const parts = [w.app, w.service, w.page, w.component]
    .filter(Boolean)
    .map(String);
  return parts.length ? parts.join(" / ") : undefined;
}

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[38;2;250;128;114m",
  grayLight: "\x1b[37m",
  grayDark: "\x1b[37m",
};

function getLevelColor(level: StoryEventBase["level"]): string {
  if (level === "tell") return ANSI.green;
  if (level === "warn") return ANSI.yellow;
  return ANSI.red;
}

function colorizeJsonSections(
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

function countBrackets(line: string): number {
  const open = (line.match(/\[/g) || []).length;
  const close = (line.match(/\]/g) || []).length;
  return open - close;
}
