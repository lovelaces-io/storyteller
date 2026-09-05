/**
 * The Librarian's answers, as plain functions over a StoryStore.
 *
 * Everything the MCP tools return is shaped here, so it can be tested
 * without a transport and reused by anything else that wants to ask. Two
 * disciplines throughout: results are sized for a context window (summaries
 * for a search, the whole narrative for one story, explicit truncation when
 * a list is cut), and nothing here can write or delete.
 */
import type { StoredStory, StoryLevel, StoryNote, StoryQuery, StoryStore } from "@lovelaces-io/storyteller";
import { parseDuration, stories } from "@lovelaces-io/storyteller";

/** A story as a search result: enough to decide whether to open it */
export type StorySummary = {
  storyId: string;
  title: string;
  level: StoryLevel;
  timestamp: string;
  durationMs?: number;
  origin?: string;
  /** How many notes the story has */
  notes: number;
  /** The last note's text: what the story was doing when it ended */
  lastNote?: string;
  error?: string;
  parentStoryId?: string;
};

/** Optional fields may be explicitly undefined: that is what a parsed tool call carries */
export type SearchArguments = {
  about?: string | undefined;
  from?: string | undefined;
  level?: "info" | "warn" | "oops" | StoryLevel | undefined;
  atLeast?: "info" | "warn" | "oops" | StoryLevel | undefined;
  failing?: boolean | undefined;
  since?: string | undefined;
  until?: string | undefined;
  slowerThan?: string | undefined;
  under?: string | undefined;
  order?: "newest" | "oldest" | undefined;
  limit?: number | undefined;
};

export type SearchResult = {
  stories: StorySummary[];
  /** How many matched in total, before the limit */
  total: number;
  truncated: boolean;
  /** The structured criteria the question compiled to, so the agent can see what it asked */
  query: Record<string, unknown>;
};

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
/** How many notes `get_story` returns before it cuts, keeping first and last */
export const MAX_NOTES = 200;
/** Longest string in any result; the normalizer already caps at 8000, this is for a context window */
export const MAX_TEXT = 2000;

function originLabel(story: StoredStory): string | undefined {
  const origin = story.origin;
  if (!origin) return undefined;
  const parts: string[] = [];
  for (const key of ["who", "what", "where"] as const) {
    const value = origin[key];
    if (value === undefined || value === null) continue;
    parts.push(typeof value === "string" ? value : JSON.stringify(value));
  }
  return parts.length ? parts.join(" / ") : undefined;
}

function cut(text: string, limit = MAX_TEXT): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…[+${text.length - limit} chars]`;
}

export function summarize(story: StoredStory): StorySummary {
  const last = story.notes[story.notes.length - 1];
  const summary: StorySummary = {
    storyId: story.storyId,
    title: cut(story.title, 300),
    level: story.level,
    timestamp: story.timestamp,
    notes: story.notes.length,
  };
  if (story.durationMs !== undefined) summary.durationMs = story.durationMs;
  const origin = originLabel(story);
  if (origin) summary.origin = cut(origin, 200);
  if (last) summary.lastNote = cut(last.note, 300);
  if (story.error?.message) summary.error = cut(story.error.message, 300);
  if (story.parentStoryId) summary.parentStoryId = story.parentStoryId;
  return summary;
}

/** Bound every string in a JSON tree, so one huge value cannot flood a reply */
function boundStrings<T>(value: T): T {
  if (typeof value === "string") return cut(value) as unknown as T;
  if (Array.isArray(value)) return value.map(boundStrings) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) out[key] = boundStrings(child);
    return out as T;
  }
  return value;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

/** Build the question from the tool's arguments. Throws on a bad duration, with a message the agent can act on. */
export function buildQuestion(store: StoryStore, args: SearchArguments, now?: () => Date) {
  let question = stories(store, now ? { now } : {});
  if (args.about) question = question.about(args.about);
  if (args.from) question = question.from(args.from);
  if (args.level) question = question.level(args.level);
  if (args.atLeast) question = question.atLeast(args.atLeast);
  if (args.failing === true) question = question.failing();
  if (args.failing === false) question = question.succeeding();
  if (args.since) question = question.since(args.since);
  if (args.until) question = question.until(args.until);
  if (args.slowerThan) question = question.slowerThan(args.slowerThan);
  if (args.under) question = question.under(args.under);
  if (args.order === "oldest") question = question.oldest();
  return question;
}

/** "The three stories where checkout failed yesterday" — summaries, bounded */
export async function searchStories(store: StoryStore, args: SearchArguments, now?: () => Date): Promise<SearchResult> {
  const question = buildQuestion(store, args, now);
  const limit = clampLimit(args.limit);
  const all = await question.all();
  const query: StoryQuery = question.toQuery();
  return {
    stories: all.slice(0, limit).map(summarize),
    total: all.length,
    truncated: all.length > limit,
    query: serializeQuery(query),
  };
}

function serializeQuery(query: StoryQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

export type StoryDetail = {
  story: StoredStory;
  /** Its chapters, as summaries */
  chapters: StorySummary[];
  /** Set when the notes were cut to fit */
  notesTruncated?: { kept: number; omitted: number };
};

/** One story, complete, with its chapters. Notes are cut to MAX_NOTES keeping the first and last. */
export async function getStory(store: StoryStore, storyId: string): Promise<StoryDetail | undefined> {
  const story = await store.get(storyId);
  if (!story) return undefined;
  const chapters = (await store.children(storyId)).map(summarize);
  const detail: StoryDetail = { story: boundStrings(story), chapters };
  if (story.notes.length > MAX_NOTES) {
    const head = Math.floor(MAX_NOTES / 2);
    const tail = MAX_NOTES - head;
    const kept: StoryNote[] = [...story.notes.slice(0, head), ...story.notes.slice(-tail)];
    detail.story = { ...detail.story, notes: boundStrings(kept) };
    detail.notesTruncated = { kept: MAX_NOTES, omitted: story.notes.length - MAX_NOTES };
  }
  return detail;
}

export type PeriodSummary = {
  since: string;
  until: string;
  total: number;
  byLevel: Record<StoryLevel, number>;
  failed: number;
  /** Most frequent titles, with counts — what kept happening */
  topTitles: { title: string; count: number; level: StoryLevel }[];
  /** Origins seen, with counts */
  origins: { origin: string; count: number }[];
  slowest: StorySummary[];
  /** The most recent failures, so the answer can point at something concrete */
  recentFailures: StorySummary[];
  /** Set when more stories matched than were read for the summary */
  sampled?: { read: number; of: number };
};

const SUMMARY_SAMPLE = 5000;

/** "What happened to billing this week" — counts, what recurred, what was slow, what failed */
export async function summarizePeriod(
  store: StoryStore,
  args: { since?: string | undefined; until?: string | undefined; from?: string | undefined; about?: string | undefined },
  now: () => Date = () => new Date()
): Promise<PeriodSummary> {
  const end = args.until ? new Date(now().getTime() - parseDuration(args.until)) : now();
  const start = new Date(now().getTime() - parseDuration(args.since ?? "24h"));
  const question = buildQuestion(store, { from: args.from, about: args.about, since: args.since ?? "24h", until: args.until }, now);
  const all = await question.all();
  const read = all.slice(0, SUMMARY_SAMPLE);

  const byLevel: Record<StoryLevel, number> = { Information: 0, Warning: 0, Error: 0 };
  const titles = new Map<string, { count: number; level: StoryLevel }>();
  const origins = new Map<string, number>();
  let failed = 0;
  for (const story of read) {
    byLevel[story.level]++;
    if (story.level === "Error" || story.error) failed++;
    const entry = titles.get(story.title) ?? { count: 0, level: story.level };
    entry.count++;
    if (story.level === "Error") entry.level = "Error";
    else if (story.level === "Warning" && entry.level !== "Error") entry.level = "Warning";
    titles.set(story.title, entry);
    const origin = originLabel(story) ?? "unknown";
    origins.set(origin, (origins.get(origin) ?? 0) + 1);
  }

  const summary: PeriodSummary = {
    since: start.toISOString(),
    until: end.toISOString(),
    total: all.length,
    byLevel,
    failed,
    topTitles: [...titles.entries()]
      .map(([title, entry]) => ({ title: cut(title, 200), count: entry.count, level: entry.level }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    origins: [...origins.entries()].map(([origin, count]) => ({ origin: cut(origin, 200), count })).sort((a, b) => b.count - a.count).slice(0, 10),
    slowest: [...read]
      .filter((story) => story.durationMs !== undefined)
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 5)
      .map(summarize),
    recentFailures: read.filter((story) => story.level === "Error" || story.error).slice(0, 5).map(summarize),
  };
  if (all.length > read.length) summary.sampled = { read: read.length, of: all.length };
  return summary;
}

export type RelatedStories = {
  storyId: string;
  parent?: StorySummary;
  chapters: StorySummary[];
  siblings: StorySummary[];
  /** Other stories from the same origin around the same time */
  sameOrigin: StorySummary[];
  /** Other stories with the same title, so a recurring failure shows as one */
  sameTitle: StorySummary[];
};

/** Other stories sharing an origin, a parent, or a title with this one */
export async function findRelated(store: StoryStore, storyId: string, options: { window?: string | undefined; limit?: number | undefined } = {}): Promise<RelatedStories | undefined> {
  const story = await store.get(storyId);
  if (!story) return undefined;
  const limit = clampLimit(options.limit ?? 10);
  const windowMs = parseDuration(options.window ?? "1h");
  const at = Date.parse(story.timestamp);
  const around: StoryQuery = { since: new Date(at - windowMs), until: new Date(at + windowMs) };
  const notSelf = (list: StoredStory[]) => list.filter((candidate) => candidate.storyId !== storyId);

  const related: RelatedStories = {
    storyId,
    chapters: (await store.children(storyId)).map(summarize),
    siblings: story.parentStoryId ? notSelf(await store.children(story.parentStoryId)).slice(0, limit).map(summarize) : [],
    sameOrigin: [],
    sameTitle: notSelf(await store.query({ about: story.title, limit: limit + 1 }))
      .filter((candidate) => candidate.title === story.title)
      .slice(0, limit)
      .map(summarize),
  };
  if (story.parentStoryId) {
    const parent = await store.get(story.parentStoryId);
    if (parent) related.parent = summarize(parent);
  }
  const origin = originLabel(story);
  if (origin) {
    const from = typeof story.origin?.who === "string" ? story.origin.who : origin.split(" / ")[0]!;
    related.sameOrigin = notSelf(await store.query({ ...around, from, limit: limit + 1 })).slice(0, limit).map(summarize);
  }
  return related;
}
