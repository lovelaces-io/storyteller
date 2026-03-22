import { consoleAudience } from "./audiences/consoleAudience";
import { ANSI, getLevelColor, formatOrigin, colorizeJsonSections } from "./utils";

export type StoryLevel = "tell" | "warn" | "oops";

export type StoryContextValue = Record<string, unknown> | string;

export type StoryError = {
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
};

export type StoryNote = {
  timestamp: string;
  note: string;
  who?: StoryContextValue;
  what?: StoryContextValue;
  where?: StoryContextValue;
  error?: StoryError;
};

export type StoryEventBase = {
  timestamp: string;
  level: StoryLevel;
  title: string;

  origin?: {
    who?: StoryContextValue;
    what?: StoryContextValue;
    where?: StoryContextValue;
  };

  notes: StoryNote[];

  error?: StoryError;
};

export type StorySummaryOptions = {
  timezone?: string;
  locale?: string;
  verbosity?: "brief" | "normal" | "full";
  maxNotes?: number;
  showData?: boolean;
  colorize?: boolean;
};

export type StoryPreviewOptions = StorySummaryOptions & {
  title?: string;
  level?: StoryLevel;
  error?: unknown;
};

export type StorySummaryNote = {
  timestamp: string;
  when: string;
  note: string;
  text: string;
  who?: StoryContextValue;
  what?: StoryContextValue;
  where?: StoryContextValue;
  error?: StoryError;
};

export type StorySummaryData = {
  title: string;
  level: StoryLevel;
  when: string;
  durationMs?: number;
  duration?: string;
  origin?: StoryEventBase["origin"];
  notes: StorySummaryNote[];
  error?: StoryError;
};

export type StorySummary = {
  text: string;
  data: StorySummaryData;
};

export type StoryEvent = StoryEventBase & {
  summarize: (options?: StorySummaryOptions) => StorySummary;
};

export type AudienceMember = {
  name: string;
  accepts?: (event: StoryEvent) => boolean;
  hear: (event: StoryEvent) => void | Promise<void>;
};

type NoteData = {
  who?: StoryContextValue;
  what?: StoryContextValue;
  where?: StoryContextValue;
  error?: unknown;
};

/** Manages the set of audience members that receive story events */
class AudienceRegistry {
  private members = new Map<string, AudienceMember>();

  /** Register an audience member, replacing any existing member with the same name */
  add(member: AudienceMember) {
    this.members.set(member.name, member);
    return this;
  }

  /** Remove an audience member by name */
  remove(name: string) {
    this.members.delete(name);
    return this;
  }

  /** Return all registered audience members */
  getAll() {
    return [...this.members.values()];
  }

  /** Return only the audience members matching the given names */
  getOnly(names: string[]) {
    return names.map((name) => this.members.get(name)).filter(Boolean) as AudienceMember[];
  }
}

/** Core logging class that collects timestamped notes and emits them as structured story events */
export class Storyteller {
  public readonly audience = new AudienceRegistry();

  private readonly origin?: StoryEventBase["origin"];
  private notes: StoryNote[] = [];

  constructor(options?: { origin?: StoryEventBase["origin"]; audiences?: AudienceMember[] }) {
    this.origin = options?.origin;

    // Every storyteller gets a console audience by default
    this.audience.add(consoleAudience());

    options?.audiences?.forEach((audience) => this.audience.add(audience));
  }

  /** Add a timestamped note with optional context (who, what, where, error) */
  note(text: string, data: NoteData = {}) {
    this.notes.push({
      timestamp: new Date().toISOString(),
      note: text,
      ...(data.who ? { who: data.who } : {}),
      ...(data.what ? { what: data.what } : {}),
      ...(data.where ? { where: data.where } : {}),
      ...(data.error ? { error: normalizeError(data.error) } : {}),
    });
    return this;
  }

  /** Clear all accumulated notes without emitting a story */
  reset() {
    this.notes = [];
    return this;
  }

  /** Generate a formatted summary of current notes without emitting or clearing them */
  summarize(options: StoryPreviewOptions = {}) {
    const {
      title = "Story preview",
      level = "tell",
      error,
      ...summaryOptions
    } = options;
    const event: StoryEventBase = {
      timestamp: new Date().toISOString(),
      level,
      title,
      ...(this.origin ? { origin: this.origin } : {}),
      notes: [...this.notes],
      ...(error ? { error: normalizeError(error) } : {}),
    };

    return summarizeStory(event, summaryOptions);
  }

  /** Emit a story at the "tell" level (success / informational) */
  tell(title: string) {
    return this.createDelivery("tell", title);
  }

  /** Emit a story at the "warn" level (something was off) */
  warn(title: string) {
    return this.createDelivery("warn", title);
  }

  /** Emit a story at the "oops" level (something broke) with an optional error */
  oops(title: string, error?: unknown) {
    return this.createDelivery("oops", title, error);
  }

  /** Build a story event and schedule delivery, returning a handle to override the audience list */
  private createDelivery(level: StoryLevel, title: string, error?: unknown) {
    const event = this.buildEvent(level, title, error);

    let delivered = false;
    let defaultCancelled = false;

    // Delivery is microtask-scheduled so .to() can override synchronously
    queueMicrotask(() => {
      if (delivered || defaultCancelled) return;
      delivered = true;
      void this.deliver(event);
    });

    return {
      to: (...names: string[]) => {
        defaultCancelled = true;
        if (delivered) return;
        delivered = true;
        void this.deliver(event, { only: names });
      },
    };
  }

  /** Assemble the story event from current notes and clear notes for the next story */
  private buildEvent(level: StoryLevel, title: string, error?: unknown): StoryEvent {
    const now = new Date().toISOString();
    const collectedNotes = [...this.notes];

    this.notes = [];

    const event: StoryEventBase = {
      timestamp: now,
      level,
      title,
      ...(this.origin ? { origin: this.origin } : {}),
      notes: collectedNotes,
      ...(error ? { error: normalizeError(error) } : {}),
    };

    const eventWithSummary = event as StoryEvent;
    Object.defineProperty(eventWithSummary, "summarize", {
      value: (options?: StorySummaryOptions) => summarizeStory(event, options),
      enumerable: false,
    });

    return eventWithSummary;
  }

  /** Deliver a story event to matching audience members */
  private async deliver(event: StoryEvent, options?: { only?: string[] }) {
    const targets = options?.only?.length
      ? this.audience.getOnly(options.only)
      : this.audience.getAll();

    await Promise.allSettled(
      targets
        .filter((member) => (member.accepts ? member.accepts(event) : true))
        .map((member) => member.hear(event))
    );
  }
}

/** Convert an unknown error value into a serializable StoryError object */
function normalizeError(rawError: unknown): StoryError {
  if (rawError instanceof Error) {
    const normalized: StoryError = {
      name: rawError.name,
      message: rawError.message,
    };

    if (rawError.stack !== undefined) {
      normalized.stack = rawError.stack;
    }

    const cause = (rawError as { cause?: unknown }).cause;
    if (cause !== undefined) {
      normalized.cause = cause;
    }

    return normalized;
  }

  return { message: String(rawError) };
}

/** Calculate the duration between the first and last note in a sequence */
function calculateNoteDuration(notes: StoryNote[]) {
  if (notes.length <= 1) {
    return {
      durationMs: undefined as number | undefined,
    };
  }

  const startTime = Date.parse(notes[0]!.timestamp);
  const endTime = Date.parse(notes[notes.length - 1]!.timestamp);

  return {
    durationMs: Number.isFinite(startTime) && Number.isFinite(endTime)
      ? Math.max(0, endTime - startTime)
      : undefined,
  };
}

/** Generate a formatted, human-readable summary from a story event */
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

  const orderedNotes = [...story.notes].sort(
    (noteA, noteB) => Date.parse(noteA.timestamp) - Date.parse(noteB.timestamp)
  );
  const noteTiming = calculateNoteDuration(orderedNotes);
  const originLabel = formatOrigin(story.origin);
  const duration =
    noteTiming.durationMs != null ? formatDuration(noteTiming.durationMs) : undefined;

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
    ...(noteTiming.durationMs != null ? { durationMs: noteTiming.durationMs } : {}),
    ...(duration ? { duration } : {}),
    ...(story.origin ? { origin: story.origin } : {}),
    notes: summaryNotes,
    ...(story.error ? { error: story.error } : {}),
  };

  const levelColor = getLevelColor(story.level);
  const label = (text: string) =>
    colorize ? `${levelColor}${text}${ANSI.reset}` : text;

  const lines: string[] = [];
  lines.push(`${label("Story")}: ${story.title}`);
  lines.push(`${label("Level")}: ${story.level}`);
  lines.push(`${label("Time")}: ${data.when}${duration ? ` (${duration})` : ""}`);

  if (originLabel) {
    lines.push(`${label("Origin")}: ${originLabel}`);
  }

  if (story.error) {
    const errorLine = [story.error.name, story.error.message]
      .filter(Boolean)
      .join(": ");
    if (errorLine) lines.push(`${label("Error")}: ${errorLine}`);
  }

  if (verbosity !== "brief" && summaryNotes.length) {
    lines.push(`${label("Notes")}:`);
    for (const note of summaryNotes) {
      lines.push(`  ${note.when} — ${note.text}`);
    }
    if (orderedNotes.length > summaryNotes.length) {
      lines.push(`  … (${orderedNotes.length - summaryNotes.length} more)`);
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

  return { text: lines.join("\n"), data };
}

/** Convert milliseconds into a human-readable duration string */
function formatDuration(milliseconds: number): string {
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
    if (what.field) details.push(`field=${String(what.field)}`);
    if (what.status) details.push(`status=${String(what.status)}`);
  }
  if (typeof where === "string") {
    details.push(`where=${where}`);
  } else if (where) {
    if (where.component) details.push(`component=${String(where.component)}`);
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
