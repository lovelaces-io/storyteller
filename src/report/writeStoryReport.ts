import type { StoryEventBase } from "../storyteller";
import { summarizeStory } from "../formatting";
import { ANSI, getLevelColor, formatOrigin, colorizeJsonSections } from "../utils";

export type StoryReportOptions = {
  timezone?: string;
  locale?: string;
  verbosity?: "brief" | "normal" | "full";
  maxNotesPerStory?: number;
  showData?: boolean;
  colorize?: boolean;
};

/** Generate a formatted report from an array of story events, grouped by day */
export function writeStoryReport(
  stories: StoryEventBase[],
  options: StoryReportOptions = {}
): string {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotesPerStory = 50,
    showData = true,
    colorize = true,
  } = options;

  if (!stories.length) {
    return "Storyteller Report\n\n(no stories)\n";
  }

  const sorted = [...stories].sort(
    (storyA, storyB) => Date.parse(storyA.timestamp) - Date.parse(storyB.timestamp)
  );

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  const firstStory = sorted[0];
  const lastStory = sorted[sorted.length - 1];
  if (!firstStory || !lastStory) {
    return "Storyteller Report\n\n(no stories)\n";
  }

  const lines: string[] = [];
  lines.push(`Storyteller Report (${timezone})`);
  lines.push(
    `Range: ${dateFormatter.format(new Date(firstStory.timestamp))} – ${dateFormatter.format(
      new Date(lastStory.timestamp)
    )}`
  );
  lines.push("");

  const storiesByDay = new Map<string, StoryEventBase[]>();
  for (const story of sorted) {
    const dayKey = dateFormatter.format(new Date(story.timestamp));
    const dayEvents = storiesByDay.get(dayKey) ?? [];
    dayEvents.push(story);
    storiesByDay.set(dayKey, dayEvents);
  }

  for (const [day, dayStories] of storiesByDay) {
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
      lines.push(`${label("Story")}: ${story.title}`);
      lines.push(`${label("Level")}: ${story.level}`);
      lines.push(`${label("Time")}: ${data.when}${duration}`);

      if (originLabel) {
        lines.push(`${label("Origin")}: ${originLabel}`);
      }

      if (data.error) {
        const errorLine = [
          data.error.name,
          data.error.message,
        ]
          .filter(Boolean)
          .join(": ");
        if (errorLine) lines.push(`${label("Error")}: ${errorLine}`);
      }

      if (verbosity !== "brief" && data.notes.length) {
        lines.push(`  ${label("Notes")}:`);

        for (const summaryNote of data.notes) {
          lines.push(`    ${summaryNote.when} — ${summaryNote.text}`);
        }

        if (story.notes.length > data.notes.length) {
          lines.push(
            `    … (${story.notes.length - data.notes.length} more)`
          );
        }
      }

      if (showData) {
        lines.push(`${label("Data")}:`);
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
