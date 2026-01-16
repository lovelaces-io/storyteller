type StoryLevel = "tell" | "warn" | "oops";
type StoryContextValue = Record<string, unknown> | string;
type StoryError = {
    name?: string;
    message?: string;
    stack?: string;
    cause?: unknown;
};
type StoryNote = {
    ts: string;
    note: string;
    who?: StoryContextValue;
    what?: StoryContextValue;
    where?: StoryContextValue;
    error?: StoryError;
};
type StoryEventBase = {
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
type StorySummaryOptions = {
    timezone?: string;
    locale?: string;
    verbosity?: "brief" | "normal" | "full";
    maxNotes?: number;
    showData?: boolean;
    colorize?: boolean;
};
type StorySummaryNote = {
    ts: string;
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
    summarize: (opts?: StorySummaryOptions) => StorySummary;
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
declare class AudienceRegistry {
    private map;
    add(member: AudienceMember): this;
    remove(name: string): this;
    getAll(): AudienceMember[];
    getOnly(names: string[]): AudienceMember[];
}
declare class Storyteller {
    readonly audience: AudienceRegistry;
    private readonly origin?;
    private notes;
    constructor(opts?: {
        origin?: StoryEventBase["origin"];
        audiences?: AudienceMember[];
    });
    note(text: string, data?: NoteData): this;
    reset(): this;
    tell(title: string): {
        to: (...names: string[]) => void;
    };
    warn(title: string): {
        to: (...names: string[]) => void;
    };
    oops(title: string, err?: unknown): {
        to: (...names: string[]) => void;
    };
    private createDelivery;
    private buildEvent;
    private deliver;
}
declare function summarizeStory(story: StoryEventBase, opts?: StorySummaryOptions): StorySummary;

declare function consoleAudience(): AudienceMember;

declare function dbAudience(insert: (event: StoryEvent) => Promise<void> | void): AudienceMember;

type StoryReportOptions = {
    timezone?: string;
    locale?: string;
    verbosity?: "brief" | "normal" | "full";
    maxNotesPerStory?: number;
    showData?: boolean;
    colorize?: boolean;
};
declare function writeStoryReport(stories: StoryEventBase[], opts?: StoryReportOptions): string;

export { type AudienceMember, type StoryContextValue, type StoryEvent, type StoryEventBase, type StoryLevel, type StoryNote, type StoryReportOptions, type StorySummary, type StorySummaryData, type StorySummaryNote, type StorySummaryOptions, Storyteller, consoleAudience, dbAudience, summarizeStory, writeStoryReport };
