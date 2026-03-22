import { consoleAudience } from "./audiences/consoleAudience";
import { ANSI, getLevelColor, formatOrigin, colorizeJsonSections } from "./utils";

export type StoryLevel = "tell" | "warn" | "oops";

export type StoryContextValue = Record<string, unknown> | string;

type StoryError = {
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
};

export type StoryNote = {
  ts: string;
  note: string;
  who?: StoryContextValue;
  what?: StoryContextValue;
  where?: StoryContextValue;
  error?: StoryError;
};

export type StoryEventBase = {
  ts: string;
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
  ts: string;
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
  summarize: (opts?: StorySummaryOptions) => StorySummary;
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

class AudienceRegistry {
  private map = new Map<string, AudienceMember>();

  add(member: AudienceMember) {
    this.map.set(member.name, member);
    return this;
  }
  remove(name: string) {
    this.map.delete(name);
    return this;
  }
  getAll() {
    return [...this.map.values()];
  }
  getOnly(names: string[]) {
    return names.map((n) => this.map.get(n)).filter(Boolean) as AudienceMember[];
  }
}

export class Storyteller {
  public readonly audience = new AudienceRegistry();

  private readonly origin?: StoryEventBase["origin"];
  private notes: StoryNote[] = [];

  constructor(opts?: { origin?: StoryEventBase["origin"]; audiences?: AudienceMember[] }) {
    this.origin = opts?.origin;

    // default console audience (all levels)
    this.audience.add(consoleAudience());

    opts?.audiences?.forEach((a) => this.audience.add(a));
  }

  note(text: string, data: NoteData = {}) {
    this.notes.push({
      ts: new Date().toISOString(),
      note: text,
      ...(data.who ? { who: data.who } : {}),
      ...(data.what ? { what: data.what } : {}),
      ...(data.where ? { where: data.where } : {}),
      ...(data.error ? { error: normalizeError(data.error) } : {}),
    });
    return this;
  }

  reset() {
    this.notes = [];
    return this;
  }

  summarize(opts: StoryPreviewOptions = {}) {
    const {
      title = "Story preview",
      level = "tell",
      error,
      ...summaryOpts
    } = opts;
    const event: StoryEventBase = {
      ts: new Date().toISOString(),
      level,
      title,
      ...(this.origin ? { origin: this.origin } : {}),
      notes: [...this.notes],
      ...(error ? { error: normalizeError(error) } : {}),
    };

    return summarizeStory(event, summaryOpts);
  }

  tell(title: string) {
    return this.createDelivery("tell", title);
  }
  warn(title: string) {
    return this.createDelivery("warn", title);
  }
  oops(title: string, err?: unknown) {
    return this.createDelivery("oops", title, err);
  }

  private createDelivery(level: StoryLevel, title: string, err?: unknown) {
    const event = this.buildEvent(level, title, err);

    // default: all audiences (scheduled so `.to()` can override)
    let delivered = false;
    let cancelledDefault = false;

    queueMicrotask(() => {
      if (delivered || cancelledDefault) return;
      delivered = true;
      void this.deliver(event);
    });

    return {
      to: (...names: string[]) => {
        cancelledDefault = true;
        if (delivered) return;
        delivered = true;
        void this.deliver(event, { only: names });
      },
    };
  }

  private buildEvent(level: StoryLevel, title: string, err?: unknown): StoryEvent {
    const now = new Date().toISOString();
    const notes = [...this.notes];

    // clear notes after telling the story (your desired behavior)
    this.notes = [];

    const event: StoryEventBase = {
      ts: now,
      level,
      title,
      ...(this.origin ? { origin: this.origin } : {}),
      notes,
      ...(err ? { error: normalizeError(err) } : {}),
    };

    const eventWithSummary = event as StoryEvent;
    Object.defineProperty(eventWithSummary, "summarize", {
      value: (opts?: StorySummaryOptions) => summarizeStory(event, opts),
      enumerable: false,
    });

    return eventWithSummary;
  }

  private async deliver(event: StoryEvent, opts?: { only?: string[] }) {
    const members = opts?.only?.length ? this.audience.getOnly(opts.only) : this.audience.getAll();

    await Promise.allSettled(
      members
        .filter((m) => (m.accepts ? m.accepts(event) : true))
        .map((m) => m.hear(event))
    );
  }
}

function normalizeError(err: unknown): StoryError {
  if (err instanceof Error) {
    const normalized: StoryError = {
      name: err.name,
      message: err.message,
    };

    if (err.stack !== undefined) {
      normalized.stack = err.stack;
    }

    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined) {
      normalized.cause = cause;
    }

    return normalized;
  }

  return { message: String(err) };
}

function summarizeNotes(notes: StoryNote[]) {
  if (notes.length <= 1) {
    return {
      durationMs: undefined as number | undefined,
    };
  }

  const start = Date.parse(notes[0]!.ts);
  const end = Date.parse(notes[notes.length - 1]!.ts);

  return {
    durationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : undefined,
  };
}

export function summarizeStory(
  story: StoryEventBase,
  opts: StorySummaryOptions = {}
): StorySummary {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotes = 50,
    showData = true,
    colorize = true,
  } = opts;

  const dateTimeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  const orderedNotes = [...story.notes].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts)
  );
  const summary = summarizeNotes(orderedNotes);
  const originLabel = formatOrigin(story.origin);
  const duration =
    summary.durationMs != null ? formatDuration(summary.durationMs) : undefined;

  const slicedNotes = orderedNotes.slice(0, maxNotes);
  const notes: StorySummaryNote[] = slicedNotes.map((note) => ({
    ts: note.ts,
    when: timeFmt.format(new Date(note.ts)),
    note: note.note,
    text: formatNote(note, verbosity),
    ...(note.who ? { who: note.who } : {}),
    ...(note.what ? { what: note.what } : {}),
    ...(note.where ? { where: note.where } : {}),
    ...(note.error ? { error: note.error } : {}),
  }));

  const data: StorySummaryData = {
    title: story.title,
    level: story.level,
    when: dateTimeFmt.format(new Date(story.ts)),
    ...(summary.durationMs != null ? { durationMs: summary.durationMs } : {}),
    ...(duration ? { duration } : {}),
    ...(story.origin ? { origin: story.origin } : {}),
    notes,
    ...(story.error ? { error: story.error } : {}),
  };

  const levelColor = getLevelColor(story.level);
  const label = (text: string) =>
    colorize ? `${levelColor}${text}${ANSI.reset}` : text;

  const lines: string[] = [];
  lines.push(`${label("StorytellerSummary")}: ${story.title}`);
  lines.push(`${label("Time")}: ${data.when}${duration ? ` (${duration})` : ""}`);

  if (originLabel) {
    lines.push(`${label("Origin")}: ${originLabel}`);
  }

  if (story.error) {
    const errLine = [story.error.name, story.error.message]
      .filter(Boolean)
      .join(": ");
    if (errLine) lines.push(`${label("?")}: ${errLine}`);
  }

  if (verbosity !== "brief" && notes.length) {
    lines.push(`${label("Notes")}:`);
    for (const note of notes) {
      lines.push(`- ${note.when} - ${note.text}`);
    }
    if (orderedNotes.length > notes.length) {
      lines.push(`… (${orderedNotes.length - notes.length} more)`);
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

  return { text: lines.join("\n"), data };
}

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


function formatNote(
  note: StoryNote,
  verbosity: "brief" | "normal" | "full"
): string {
  if (verbosity !== "full") return note.note;

  const extras: string[] = [];
  const what = note.what;
  const where = note.where;

  if (typeof what === "string") {
    extras.push(`what=${what}`);
  } else if (what) {
    if (what.field) extras.push(`field=${String(what.field)}`);
    if (what.status) extras.push(`status=${String(what.status)}`);
  }
  if (typeof where === "string") {
    extras.push(`where=${where}`);
  } else if (where) {
    if (where.component) extras.push(`component=${String(where.component)}`);
  }
  if (note.error) {
    const errLine = [note.error.name, note.error.message]
      .filter(Boolean)
      .join(": ");
    if (errLine) extras.push(`error=${errLine}`);
  }

  return extras.length
    ? `${note.note} (${extras.join(" ")})`
    : note.note;
}
