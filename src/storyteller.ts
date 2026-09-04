import { consoleAudience } from "./audiences/consoleAudience";
import { ndjsonAudience } from "./audiences/ndjsonAudience";
import type { LevelInput, OutputFormat } from "./environment";
import {
  meetsLevel,
  resolveMinimumLevel,
  resolveOutputFormat,
  readEnvironmentValue,
  toStoryLevel,
} from "./environment";

export type { LevelInput } from "./environment";
import { formatStory } from "./formatting";
import type { JsonValue } from "./normalize";
import { normalizeError, normalizeValue } from "./normalize";

/** Human-readable level labels stored in story records */
export type StoryLevel = "Information" | "Warning" | "Error";

/**
 * A stored context value. Always JSON-safe — whatever the caller passed in has
 * already been through the normalizer by the time it reaches a record.
 */
export type StoryContextValue = JsonValue;

/** Context accepted from callers. Anything goes; the normalizer makes it storable. */
export type StoryContextInput = unknown;

export type StoryError = {
  name?: string;
  message?: string;
  stack?: string;
  cause?: JsonValue;
  /** Members of an AggregateError */
  errors?: StoryError[];
};

/** Origin as stored on a record */
export type StoryOrigin = {
  who?: StoryContextValue;
  what?: StoryContextValue;
  where?: StoryContextValue;
};

/** Origin as accepted from callers */
export type StoryOriginInput = {
  who?: StoryContextInput;
  what?: StoryContextInput;
  where?: StoryContextInput;
};

export type StoryNote = {
  timestamp: string;
  /**
   * Position within the story, assigned when the note is taken. Gap-free from 0.
   * Optional so records written before sequencing existed still typecheck.
   */
  sequence?: number;
  note: string;
  /** Omitted when the note carries the story's default Information level */
  level?: StoryLevel;
  who?: StoryContextValue;
  what?: StoryContextValue;
  where?: StoryContextValue;
  error?: StoryError;
};

export type StoryEventBase = {
  timestamp: string;
  level: StoryLevel;
  title: string;

  /**
   * Correlates every note emission with the story it belongs to. Always set on
   * events this library builds; optional so older stored records still typecheck.
   */
  storyId?: string;

  origin?: StoryOrigin;

  notes: StoryNote[];
  durationMs?: number;

  /**
   * How many emissions were dropped for back-pressure while this story was being
   * collected. Present only when something was actually lost, so the loss shows up
   * in the record instead of vanishing.
   */
  droppedEmissions?: number;

  error?: StoryError;
};

export type ReportOptions = {
  timezone?: string;
  locale?: string;
  detail?: "brief" | "normal" | "full";
  noteLimit?: number;
  showData?: boolean;
  colors?: boolean;
};

/** @deprecated Use ReportOptions instead */
export type StorySummaryOptions = ReportOptions;

export type PreviewOptions = ReportOptions & {
  title?: string;
  level?: StoryLevel;
  error?: unknown;
};

/** @deprecated Use PreviewOptions instead */
export type StoryPreviewOptions = PreviewOptions;

export type ReportNote = {
  timestamp: string;
  when: string;
  note: string;
  text: string;
  who?: StoryContextValue;
  what?: StoryContextValue;
  where?: StoryContextValue;
  error?: StoryError;
};

/** @deprecated Use ReportNote instead */
export type StorySummaryNote = ReportNote;

export type StoryReport = {
  title: string;
  level: StoryLevel;
  when: string;
  durationMs?: number;
  duration?: string;
  origin?: StoryEventBase["origin"];
  notes: ReportNote[];
  error?: StoryError;
};

/** @deprecated Use StoryReport instead */
export type StorySummaryData = StoryReport;

export type FormattedReport = {
  text: string;
  data: StoryReport;
};

/** @deprecated Use FormattedReport instead */
export type StorySummary = FormattedReport;

export type StoryEvent = StoryEventBase & {
  kind: "story";
  summarize: (options?: ReportOptions) => FormattedReport;
};

/** @deprecated Use StoryEvent — the story-shaped emission */
export type StoryEmission = StoryEvent;

/** The two things an audience can hear */
export type EmissionKind = "note" | "story";

/**
 * A single beat, delivered the moment it happens when narration is live.
 *
 * `storyId` and `sequence` are what make streaming lossless: a consumer holding
 * the beats of a story can order and group them back into the record that
 * collected narration would have produced.
 */
export type NoteEmission = StoryNote & {
  kind: "note";
  storyId: string;
  sequence: number;
  level: StoryLevel;
  origin?: StoryOrigin;
};

export type Emission = NoteEmission | StoryEvent;

export type AudienceMember = {
  name: string;
  /**
   * Which emission kinds this audience wants. Defaults to `["story"]`, so an
   * audience written before live narration existed keeps hearing only stories.
   */
  hears?: EmissionKind[];
  /**
   * Declared with method syntax deliberately. TypeScript checks method parameters
   * bivariantly, so an audience written as `hear: (event: StoryEvent) => void`
   * still compiles. That would be unsound if such an audience could receive a note
   * emission — it cannot, because `hears` defaults to stories only.
   */
  accepts?(emission: Emission): boolean;
  hear(emission: Emission): void | Promise<void>;
};

/**
 * How a storyteller narrates.
 *
 * - `collected` — beats are buffered and leave as one story record (the default)
 * - `live` — each beat is emitted as it happens, and the story still lands at the end
 *
 * Live narration adds emissions, it never removes them: a consumer that only wants
 * beats says so with `hears: ["note"]` rather than by silencing the record.
 */
export type Narration = "collected" | "live";

/** @deprecated `both` is now the behavior of `live` — beats stream and the story still lands */
export type NarrationInput = Narration | "both";

export type NoteData = {
  who?: StoryContextInput;
  what?: StoryContextInput;
  where?: StoryContextInput;
  error?: unknown;
  /** Level for this beat alone. Defaults to Information. */
  level?: LevelInput;
  /** Emit this beat immediately even when narration is collected */
  live?: boolean;
  /** Deliver this beat only to the named audiences */
  to?: string[];
};

export type FinishOptions = {
  /** Defaults to Information */
  level?: LevelInput;
  /** The error that ended the story, normalized onto the record */
  error?: unknown;
};

export type StorytellerOptions = {
  origin?: StoryOriginInput;
  audiences?: AudienceMember[];
  /** Defaults to `STORYTELLER_NARRATION`, then `collected` */
  narration?: NarrationInput;
  /**
   * Which default audience to register: colorized text for a person, NDJSON for a
   * program. Defaults to `STORYTELLER_FORMAT`, then `text`.
   */
  format?: OutputFormat;
  /**
   * Drop emissions below this level before they reach any audience.
   * Defaults to `STORYTELLER_LEVEL`, then Information (deliver everything).
   */
  level?: LevelInput;
  /**
   * Called when an audience throws or rejects. Without one, a single throttled
   * warning per audience goes to the console — a logging library that loses
   * records in silence is worse than one that complains.
   */
  onAudienceError?: AudienceErrorHandler;
  /**
   * Cap on deliveries in flight to a single audience at once. Live narration is
   * fire-and-forget, so a slow audience would otherwise grow an unbounded queue.
   * Past the cap, emissions are dropped and counted on the closing story.
   */
  maxInFlight?: number;
};

/** Called when an audience member throws or rejects while hearing an emission */
export type AudienceErrorHandler = (
  error: unknown,
  member: AudienceMember,
  emission: Emission
) => void;

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

/**
 * Collects timestamped notes and emits them as one structured story — and, when
 * narration is live, emits each note the moment it is taken.
 *
 * @example
 * ```ts
 * const story = new Storyteller({ origin: { who: "api-server" }, narration: "live" });
 * story.note("Request received", { what: { path: "/checkout" } });
 * story.note("Validated cart");
 * story.tell("Checkout started");
 * ```
 */
export class Storyteller {
  public readonly audience = new AudienceRegistry();

  private readonly origin?: StoryOrigin;
  private notes: StoryNote[] = [];
  private narration: Narration;
  private readonly minimumLevel: StoryLevel;
  private readonly onAudienceError: AudienceErrorHandler;
  private readonly maxInFlight: number;

  /** Deliveries currently awaiting each audience, keyed by audience name */
  private readonly inFlight = new Map<string, number>();
  /** Emissions dropped for back-pressure since the current story began */
  private droppedEmissions = 0;

  /** Identifies the story currently being collected; regenerated after each telling */
  private storyId = createStoryId();
  /** Position of the next note within the current story */
  private nextSequence = 0;

  constructor(options?: StorytellerOptions) {
    const normalizedOrigin = normalizeOrigin(options?.origin);
    if (normalizedOrigin) {
      this.origin = normalizedOrigin;
    }

    this.narration = resolveNarration(options?.narration);
    this.minimumLevel = resolveMinimumLevel(options?.level);
    this.onAudienceError = options?.onAudienceError ?? reportAudienceErrorToConsole;
    this.maxInFlight = options?.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;

    // Every storyteller gets a default audience. Which one depends on who is
    // reading: a person at a terminal, or a program parsing the stream.
    this.audience.add(
      resolveOutputFormat(options?.format) === "ndjson"
        ? ndjsonAudience({ level: this.minimumLevel })
        : consoleAudience()
    );

    options?.audiences?.forEach((audience) => this.audience.add(audience));
  }

  /**
   * Switch between collected and live narration at runtime.
   * Takes effect on the next note; already-buffered notes are not replayed.
   *
   * @param narration - `collected` to buffer, `live` to emit each note as it happens
   * @returns `this` for chaining
   */
  narrate(narration: NarrationInput) {
    this.narration = resolveNarration(narration);
    return this;
  }

  /** The id of the story currently being collected */
  get currentStoryId() {
    return this.storyId;
  }

  /**
   * Report a beat of the current story.
   *
   * In collected narration the beat is buffered and leaves with the story. In live
   * narration it is emitted the moment you call this, so whoever is tuned in sees
   * the work as it happens.
   *
   * Accepts anything, not just a string — pass an error, an API response, a Map, a
   * class instance — and the value is normalized into a storable shape with the note
   * text derived from it.
   *
   * @param input - What happened: a message, or any value to describe
   * @param data - Optional context: who did it, what was involved, where it happened, any error
   * @returns `this` for chaining
   *
   * @example
   * ```ts
   * story.report("Card charged", { what: { amount: "$42" }, where: "stripe" });
   * story.report(await response.json());
   * ```
   */
  report(input: unknown, data: NoteData = {}) {
    const described = describeInput(input);
    const level = toStoryLevel(data.level);

    const note: StoryNote = {
      timestamp: new Date().toISOString(),
      sequence: this.nextSequence,
      note: described.text,
      ...(level !== "Information" ? { level } : {}),
      ...(data.who !== undefined ? { who: normalizeValue(data.who) } : {}),
      ...(data.what !== undefined
        ? { what: normalizeValue(data.what) }
        : described.what !== undefined
        ? { what: described.what }
        : {}),
      ...(data.where !== undefined ? { where: normalizeValue(data.where) } : {}),
      ...(data.error !== undefined
        ? { error: normalizeError(data.error) }
        : described.error !== undefined
        ? { error: described.error }
        : {}),
    };

    this.nextSequence += 1;
    this.notes.push(note);

    if (this.narration === "live" || data.live) {
      this.emitNote(note, level, data.to);
    }

    return this;
  }

  /** Clear all accumulated notes without emitting a story, and start a new story id */
  reset() {
    this.notes = [];
    this.startNewStory();
    return this;
  }

  /** Preview the current notes as a formatted report without emitting or clearing them */
  summarize(options: PreviewOptions = {}) {
    const {
      title = "Story preview",
      level = "Information",
      error,
      ...reportOptions
    } = options;
    const event: StoryEventBase = {
      timestamp: new Date().toISOString(),
      level,
      title,
      storyId: this.storyId,
      ...(this.origin ? { origin: this.origin } : {}),
      notes: [...this.notes],
      ...(error !== undefined ? { error: normalizeError(error) } : {}),
    };

    return formatStory(event, reportOptions);
  }

  /**
   * Finish the story: emit everything collected so far as one record, and start fresh.
   *
   * @param title - What the story was about
   * @param options - Level, and the error that ended it
   * @returns A one-shot handle whose `.to()` overrides the audience list — call it
   *   synchronously, delivery happens on the next microtask
   *
   * @example
   * ```ts
   * story.finish("Sync complete");
   * story.finish("Sync failed", { level: "oops", error }).to("db");
   * ```
   */
  finish(title: string, options: FinishOptions = {}) {
    return this.createDelivery(toStoryLevel(options.level), title, options.error);
  }

  /** @deprecated Use `finish(title)`. Removed at 1.0. */
  tell(title: string) {
    warnDeprecated("tell", "finish");
    return this.createDelivery("Information", title);
  }

  /** @deprecated Use `finish(title, { level: "warn" })`. Removed at 1.0. */
  warn(title: string) {
    warnDeprecated("warn", 'finish(title, { level: "warn" })');
    return this.createDelivery("Warning", title);
  }

  /** @deprecated Use `finish(title, { level: "oops", error })`. Removed at 1.0. */
  oops(title: string, error?: unknown) {
    warnDeprecated("oops", 'finish(title, { level: "oops", error })');
    return this.createDelivery("Error", title, error);
  }

  /** @deprecated Use `report()`. Removed at 1.0. */
  note(input: unknown, data: NoteData = {}) {
    warnDeprecated("note", "report");
    return this.report(input, data);
  }

  /** Emit a single note to the audiences listening for notes */
  private emitNote(note: StoryNote, level: StoryLevel, only?: string[]) {
    const emission: NoteEmission = {
      ...note,
      kind: "note",
      storyId: this.storyId,
      sequence: note.sequence ?? 0,
      level,
      ...(this.origin ? { origin: this.origin } : {}),
    };

    void this.deliver(emission, only ? { only } : {});
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

  /** Assemble the story event from current notes and start a fresh story */
  private buildEvent(level: StoryLevel, title: string, error?: unknown): StoryEvent {
    const now = new Date().toISOString();
    const storyId = this.storyId;
    // Read before startNewStory() zeroes it
    const droppedEmissions = this.droppedEmissions;

    // Sort notes chronologically so the record tells the story in order.
    // Sequence breaks ties: two notes can share a millisecond.
    const sortedNotes = [...this.notes].sort(
      (noteA, noteB) =>
        Date.parse(noteA.timestamp) - Date.parse(noteB.timestamp) ||
        (noteA.sequence ?? 0) - (noteB.sequence ?? 0)
    );

    this.notes = [];
    this.startNewStory();

    // Compute duration from first to last note
    const durationMs = calculateNoteDuration(sortedNotes).durationMs;

    const event: StoryEventBase = {
      timestamp: now,
      level,
      title,
      storyId,
      ...(this.origin ? { origin: this.origin } : {}),
      notes: sortedNotes,
      ...(durationMs != null ? { durationMs } : {}),
      ...(droppedEmissions ? { droppedEmissions } : {}),
      ...(error !== undefined ? { error: normalizeError(error) } : {}),
    };

    const eventWithSummary = event as StoryEvent;
    Object.defineProperty(eventWithSummary, "kind", {
      value: "story",
      enumerable: true,
    });
    Object.defineProperty(eventWithSummary, "summarize", {
      value: (options?: ReportOptions) => formatStory(event, options),
      enumerable: false,
    });

    return eventWithSummary;
  }

  /** Begin a new story: fresh id, sequence back to zero */
  private startNewStory() {
    this.storyId = createStoryId();
    this.nextSequence = 0;
    this.droppedEmissions = 0;
  }

  /** Deliver an emission to the audience members listening for its kind */
  private async deliver(emission: Emission, options?: { only?: string[] }) {
    // Cheap exit before any audience work — level filtering costs one comparison
    if (!meetsLevel(emission.level, this.minimumLevel)) return;

    const targets = options?.only?.length
      ? this.audience.getOnly(options.only)
      : this.audience.getAll();

    await Promise.all(
      targets
        .filter((member) => hearsKind(member, emission.kind))
        .filter((member) => this.acceptsSafely(member, emission))
        .map((member) => this.hearSafely(member, emission))
    );
  }

  /** Run an audience's accepts() without letting a throw from it lose the emission */
  private acceptsSafely(member: AudienceMember, emission: Emission): boolean {
    if (!member.accepts) return true;

    try {
      return member.accepts(emission);
    } catch (error) {
      this.handleAudienceError(error, member, emission);
      return false;
    }
  }

  /**
   * Hand an emission to one audience, keeping its failures and its slowness
   * contained: a throw is reported rather than swallowed, and a backlog is dropped
   * rather than grown without limit.
   */
  private async hearSafely(member: AudienceMember, emission: Emission) {
    const pending = this.inFlight.get(member.name) ?? 0;
    if (pending >= this.maxInFlight) {
      this.droppedEmissions += 1;
      return;
    }

    this.inFlight.set(member.name, pending + 1);
    try {
      await member.hear(emission);
    } catch (error) {
      this.handleAudienceError(error, member, emission);
    } finally {
      const remaining = (this.inFlight.get(member.name) ?? 1) - 1;
      if (remaining > 0) this.inFlight.set(member.name, remaining);
      else this.inFlight.delete(member.name);
    }
  }

  /** Report an audience failure without ever letting it reach caller code */
  private handleAudienceError(error: unknown, member: AudienceMember, emission: Emission) {
    try {
      this.onAudienceError(error, member, emission);
    } catch {
      // A failing error handler must not escalate into a failing log call
    }
  }
}

/** Names already warned about, so a deprecation notice appears at most once per process */
const warnedDeprecations = new Set<string>();

/**
 * Warn once about a deprecated method, and only when asked.
 *
 * Off by default on purpose: a logging library that spams its own deprecation
 * notices into a consumer's output has become the thing it was meant to fix.
 * Opt in with `STORYTELLER_DEPRECATION_WARNINGS=1`.
 */
function warnDeprecated(oldName: string, replacement: string) {
  if (warnedDeprecations.has(oldName)) return;
  if (readEnvironmentValue("STORYTELLER_DEPRECATION_WARNINGS") !== "1") return;

  warnedDeprecations.add(oldName);
  console.warn(
    `Storyteller: ${oldName}() is deprecated and will be removed at 1.0 — use ${replacement}.`
  );
}

/** Cap on simultaneous deliveries to one audience before emissions start being dropped */
const DEFAULT_MAX_IN_FLIGHT = 1000;

/** How long to stay quiet after warning about a given audience, in milliseconds */
const AUDIENCE_ERROR_THROTTLE_MS = 5000;

/** When an audience last had a failure reported, keyed by audience name */
const lastReportedAudienceError = new Map<string, number>();

/**
 * Default audience-error behavior: one throttled warning per audience.
 * Loud enough to notice a broken audience, quiet enough not to become the problem.
 */
function reportAudienceErrorToConsole(
  error: unknown,
  member: AudienceMember,
  emission: Emission
) {
  const now = Date.now();
  const lastReported = lastReportedAudienceError.get(member.name);
  if (lastReported !== undefined && now - lastReported < AUDIENCE_ERROR_THROTTLE_MS) {
    return;
  }

  lastReportedAudienceError.set(member.name, now);
  const reason = error instanceof Error ? error.message : String(error);
  console.error(
    `Storyteller: audience "${member.name}" failed to hear a ${emission.kind} — ${reason}`
  );
}

/** Check whether an audience member listens for a given emission kind */
function hearsKind(member: AudienceMember, kind: EmissionKind): boolean {
  // Audiences written before live narration existed only expect stories
  const kinds = member.hears ?? ["story"];
  return kinds.includes(kind);
}

/** Resolve the narration mode from an explicit value, the environment, then the default */
function resolveNarration(requested?: NarrationInput): Narration {
  const value = requested ?? readEnvironmentValue("STORYTELLER_NARRATION");
  if (value === "live" || value === "both") return "live";
  return "collected";
}

/** Generate an identifier for a story, falling back when crypto is unavailable */
function createStoryId(): string {
  try {
    const runtimeCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
    if (typeof runtimeCrypto?.randomUUID === "function") {
      return runtimeCrypto.randomUUID();
    }
  } catch {
    // fall through to the manual identifier
  }

  return `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Normalize each origin field so the origin on a record is as storable as the notes */
function normalizeOrigin(origin?: StoryOriginInput): StoryOrigin | undefined {
  if (!origin) return undefined;

  const normalized: StoryOrigin = {
    ...(origin.who !== undefined ? { who: normalizeValue(origin.who) } : {}),
    ...(origin.what !== undefined ? { what: normalizeValue(origin.what) } : {}),
    ...(origin.where !== undefined ? { where: normalizeValue(origin.where) } : {}),
  };

  return Object.keys(normalized).length ? normalized : undefined;
}

/**
 * Derive note text from whatever the caller passed, along with the structured
 * remainder. A string is its own text; anything else is described and carried
 * along as context so nothing is lost.
 */
function describeInput(input: unknown): {
  text: string;
  what?: JsonValue;
  error?: StoryError;
} {
  if (typeof input === "string") return { text: input };

  if (input instanceof Error) {
    const error = normalizeError(input);
    const label = [error.name, error.message].filter(Boolean).join(": ");
    return { text: label || "Error", error };
  }

  if (input === null) return { text: "null" };
  if (input === undefined) return { text: "undefined" };

  const normalized = normalizeValue(input);

  // A primitive still gets carried as structured data, not only stringified into
  // the text — otherwise `report(42)` would leave no way to read 42 back as a number
  if (typeof normalized !== "object" || normalized === null) {
    return { text: String(normalized), what: normalized };
  }

  if (Array.isArray(normalized)) {
    return { text: `Array(${normalized.length})`, what: normalized };
  }

  // Prefer a field that reads like a headline before falling back to the type name
  for (const key of ["message", "title", "name", "summary", "event"]) {
    const candidate = normalized[key];
    if (typeof candidate === "string" && candidate.length) {
      return { text: candidate, what: normalized };
    }
  }

  const typeName = normalized["@type"];
  return {
    text: typeof typeName === "string" ? typeName : "Object",
    what: normalized,
  };
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
