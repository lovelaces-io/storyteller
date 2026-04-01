import { consoleAudience } from "./audiences/consoleAudience";
import { summarizeStory } from "./formatting";

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
  durationMs?: number;

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

  /** Check if an audience member is registered by name */
  has(name: string) {
    return this.members.has(name);
  }

  /** List the names of all registered audience members */
  names() {
    return [...this.members.keys()];
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

    // Sort notes chronologically so the record tells the story in order
    const sortedNotes = [...this.notes].sort(
      (noteA, noteB) => Date.parse(noteA.timestamp) - Date.parse(noteB.timestamp)
    );

    this.notes = [];

    // Compute duration from first to last note
    const durationMs = calculateNoteDuration(sortedNotes).durationMs;

    const event: StoryEventBase = {
      timestamp: now,
      level,
      title,
      ...(this.origin ? { origin: this.origin } : {}),
      notes: sortedNotes,
      ...(durationMs != null ? { durationMs } : {}),
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

// Re-export summarizeStory from formatting module for backward compatibility
export { summarizeStory } from "./formatting";
