type StoryLevel = "tell" | "warn" | "oops";
type StoryNote = {
    ts: string;
    note: string;
    who?: Record<string, unknown>;
    what?: Record<string, unknown>;
    where?: Record<string, unknown>;
};
type StoryEvent = {
    ts: string;
    level: StoryLevel;
    title: string;
    origin?: {
        who?: Record<string, unknown>;
        what?: Record<string, unknown>;
        where?: Record<string, unknown>;
    };
    summary: {
        noteCount: number;
        durationMs?: number;
        who?: Record<string, unknown>;
        what?: Record<string, unknown>;
        where?: Record<string, unknown>;
    };
    notes: StoryNote[];
    error?: {
        name?: string;
        message?: string;
        stack?: string;
        cause?: unknown;
    };
};
type AudienceMember = {
    name: string;
    accepts?: (event: StoryEvent) => boolean;
    hear: (event: StoryEvent) => void | Promise<void>;
};
type NoteData = {
    who?: Record<string, unknown>;
    what?: Record<string, unknown>;
    where?: Record<string, unknown>;
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
        origin?: StoryEvent["origin"];
        audiences?: AudienceMember[];
    });
    note(text: string, data?: NoteData): this;
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

declare function consoleAudience(): AudienceMember;

declare function dbAudience(insert: (event: StoryEvent) => Promise<void> | void): AudienceMember;

type StoryReportOptions = {
    timezone?: string;
    locale?: string;
    verbosity?: "brief" | "normal" | "full";
    maxNotesPerStory?: number;
};
declare function writeStoryReport(stories: StoryEvent[], opts?: StoryReportOptions): string;

export { type AudienceMember, type StoryEvent, type StoryLevel, type StoryNote, type StoryReportOptions, Storyteller, consoleAudience, dbAudience, writeStoryReport };
