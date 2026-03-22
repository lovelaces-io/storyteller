type StoryLevel = "tell" | "warn" | "oops";
type StoryContextValue = Record<string, unknown> | string;
type StoryError = {
    name?: string;
    message?: string;
    stack?: string;
    cause?: unknown;
};
type StoryNote = {
    timestamp: string;
    note: string;
    who?: StoryContextValue;
    what?: StoryContextValue;
    where?: StoryContextValue;
    error?: StoryError;
};
type StoryEventBase = {
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
type StorySummaryOptions = {
    timezone?: string;
    locale?: string;
    verbosity?: "brief" | "normal" | "full";
    maxNotes?: number;
    showData?: boolean;
    colorize?: boolean;
};
type StoryPreviewOptions = StorySummaryOptions & {
    title?: string;
    level?: StoryLevel;
    error?: unknown;
};
type StorySummaryNote = {
    timestamp: string;
    when: string;
    note: string;
    text: string;
    who?: StoryContextValue;
    what?: StoryContextValue;
    where?: StoryContextValue;
    error?: StoryError;
};
type StorySummaryData = {
    title: string;
    level: StoryLevel;
    when: string;
    durationMs?: number;
    duration?: string;
    origin?: StoryEventBase["origin"];
    notes: StorySummaryNote[];
    error?: StoryError;
};
type StorySummary = {
    text: string;
    data: StorySummaryData;
};
type StoryEvent = StoryEventBase & {
    summarize: (options?: StorySummaryOptions) => StorySummary;
};
type AudienceMember = {
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
declare class AudienceRegistry {
    private members;
    /** Register an audience member, replacing any existing member with the same name */
    add(member: AudienceMember): this;
    /** Remove an audience member by name */
    remove(name: string): this;
    /** Return all registered audience members */
    getAll(): AudienceMember[];
    /** Return only the audience members matching the given names */
    getOnly(names: string[]): AudienceMember[];
}
/** Core logging class that collects timestamped notes and emits them as structured story events */
declare class Storyteller {
    readonly audience: AudienceRegistry;
    private readonly origin?;
    private notes;
    constructor(options?: {
        origin?: StoryEventBase["origin"];
        audiences?: AudienceMember[];
    });
    /** Add a timestamped note with optional context (who, what, where, error) */
    note(text: string, data?: NoteData): this;
    /** Clear all accumulated notes without emitting a story */
    reset(): this;
    /** Generate a formatted summary of current notes without emitting or clearing them */
    summarize(options?: StoryPreviewOptions): StorySummary;
    /** Emit a story at the "tell" level (success / informational) */
    tell(title: string): {
        to: (...names: string[]) => void;
    };
    /** Emit a story at the "warn" level (something was off) */
    warn(title: string): {
        to: (...names: string[]) => void;
    };
    /** Emit a story at the "oops" level (something broke) with an optional error */
    oops(title: string, error?: unknown): {
        to: (...names: string[]) => void;
    };
    /** Build a story event and schedule delivery, returning a handle to override the audience list */
    private createDelivery;
    /** Assemble the story event from current notes and clear notes for the next story */
    private buildEvent;
    /** Deliver a story event to matching audience members */
    private deliver;
}
/** Generate a formatted, human-readable summary from a story event */
declare function summarizeStory(story: StoryEventBase, options?: StorySummaryOptions): StorySummary;

type StorytellerSharedOptions = {
    origin?: StoryEventBase["origin"];
    reset?: boolean;
};
/** Return a shared singleton Storyteller instance for cross-component or cross-service logging */
declare function useStoryteller(options?: StorytellerSharedOptions): Storyteller;

/** Create an audience that logs stories to the browser console with color-coded grouped output */
declare function consoleAudience(): AudienceMember;

/** Create an audience that persists warn and oops stories to a database via the provided insert function */
declare function dbAudience(insert: (event: StoryEvent) => Promise<void> | void): AudienceMember;

type StoryReportOptions = {
    timezone?: string;
    locale?: string;
    verbosity?: "brief" | "normal" | "full";
    maxNotesPerStory?: number;
    showData?: boolean;
    colorize?: boolean;
};
/** Generate a formatted report from an array of story events, grouped by day */
declare function writeStoryReport(stories: StoryEventBase[], options?: StoryReportOptions): string;

/** ANSI escape codes for terminal colorization */
declare const ANSI: {
    reset: string;
    green: string;
    yellow: string;
    red: string;
    grayLight: string;
    grayDark: string;
};
/** Map a story level to its corresponding ANSI terminal color */
declare function getLevelColor(level: StoryLevel): string;
/** Format an origin context into a human-readable path like "app / page / component" */
declare function formatOrigin(origin?: StoryEventBase["origin"]): string | undefined;
/** Colorize JSON output, dimming the notes section for visual hierarchy */
declare function colorizeJsonSections(json: string, colors: {
    base: string;
    notes: string;
    reset: string;
}): string[];
/** Count the net bracket depth change in a line (opening brackets minus closing brackets) */
declare function countBrackets(line: string): number;

export { ANSI, type AudienceMember, type StoryContextValue, type StoryError, type StoryEvent, type StoryEventBase, type StoryLevel, type StoryNote, type StoryPreviewOptions, type StoryReportOptions, type StorySummary, type StorySummaryData, type StorySummaryNote, type StorySummaryOptions, Storyteller, colorizeJsonSections, consoleAudience, countBrackets, dbAudience, formatOrigin, getLevelColor, summarizeStory, useStoryteller, writeStoryReport };
