import type { StoryEvent, StoryNote } from "../storyteller";

export type StoryReportOptions = {
  timezone?: string;
  locale?: string;
  verbosity?: "brief" | "normal" | "full";
  maxNotesPerStory?: number;
};

export function writeStoryReport(
  stories: StoryEvent[],
  opts: StoryReportOptions = {}
): string {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotesPerStory = 50,
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

  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
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
  const byDay = new Map<string, StoryEvent[]>();
  for (const s of sorted) {
    const key = dateFmt.format(new Date(s.ts));
    const arr = byDay.get(key) ?? [];
    arr.push(s);
    byDay.set(key, arr);
  }

  for (const [day, dayStories] of byDay) {
    lines.push(day);

    for (const story of dayStories) {
      const when = timeFmt.format(new Date(story.ts));
      const duration =
        story.summary.durationMs != null
          ? ` (${formatDuration(story.summary.durationMs)})`
          : "";

      lines.push(
        `- [${story.level.toUpperCase()}] ${story.title}`
      );
      lines.push(`  Time: ${when}${duration}`);

      const origin = formatOrigin(story.origin);
      if (origin) {
        lines.push(`  Origin: ${origin}`);
      }

      const summary = formatSummary(story.summary);
      if (summary) {
        lines.push(`  Summary: ${summary}`);
      }

      if (story.level === "oops" && story.error) {
        const errLine = [
          story.error.name,
          story.error.message,
        ]
          .filter(Boolean)
          .join(": ");
        lines.push(`  Error: ${errLine}`);
      }

      if (verbosity !== "brief" && story.notes.length) {
        lines.push(`  Notes:`);

        const notes = story.notes.slice(0, maxNotesPerStory);
        for (const n of notes) {
          const t = timeFmt.format(new Date(n.ts));
          lines.push(`    ${t} - ${formatNote(n, verbosity)}`);
        }

        if (story.notes.length > notes.length) {
          lines.push(
            `    … (${story.notes.length - notes.length} more)`
          );
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

/* helpers */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${r}m`;
}

function formatOrigin(
  origin?: StoryEvent["origin"]
): string | undefined {
  if (!origin?.where) return;
  const w = origin.where as Record<string, unknown>;
  const parts = [
    w.app,
    w.service,
    w.page,
    w.component,
  ]
    .filter(Boolean)
    .map(String);
  return parts.length ? parts.join(" / ") : undefined;
}

function formatSummary(
  summary: StoryEvent["summary"]
): string | undefined {
  const parts: string[] = [];

  const what = summary.what as any;
  const where = summary.where as any;

  if (what?.op) parts.push(`op=${what.op}`);
  if (what?.status) parts.push(`status=${what.status}`);
  if (where?.route) parts.push(`route=${where.route}`);
  if (summary.noteCount) parts.push(`notes=${summary.noteCount}`);

  return parts.length ? parts.join(" ") : undefined;
}

function formatNote(
  note: StoryNote,
  verbosity: "brief" | "normal" | "full"
): string {
  if (verbosity !== "full") return note.note;

  const extras: string[] = [];
  const what = note.what as any;
  const where = note.where as any;

  if (what?.field) extras.push(`field=${what.field}`);
  if (what?.status) extras.push(`status=${what.status}`);
  if (where?.component) extras.push(`component=${where.component}`);

  return extras.length
    ? `${note.note} (${extras.join(" ")})`
    : note.note;
}
