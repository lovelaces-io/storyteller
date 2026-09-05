/**
 * The StoryStore contract: where stories go, and how they come back.
 *
 * A story is the unit of retrieval — self-contained, ordered, small enough to
 * fit in a context window. The contract is deliberately small: append, get by
 * id, query by structured criteria, walk chapters, and forget. Every adapter
 * (in memory, a file, SQLite, Postgres) answers the same questions, so the
 * questions — not each adapter's query language — are the contract.
 */
import type { StoryEvent, StoryEventBase, StoryLevel, StoryNote, StoryOrigin } from "../storyteller";
import type { JsonValue } from "../normalize";
import { DEFAULT_REDACT_KEYS } from "../normalize";
import { normalizeKeyForMatching, redactJson, type RedactionStrictness } from "../redaction";
import { meetsLevel } from "../environment";

/** A story as kept: the record without the `summarize` method, with an id it can be fetched by */
export type StoredStory = StoryEventBase & { storyId: string };

/**
 * Structured criteria. Every field narrows; an empty query matches everything.
 * Built by hand or by the query vocabulary; adapters receive this object,
 * never a string to parse.
 */
export type StoryQuery = {
  /** Stories whose timestamp is at or after this instant */
  since?: Date;
  /** Stories whose timestamp is before this instant */
  until?: Date;
  /** Exactly this level, or any of these */
  level?: StoryLevel | StoryLevel[];
  /** At least this level: Warning matches Warning and Error */
  minimumLevel?: StoryLevel;
  /** Case-insensitive match over the title, note text, scalar context and error messages */
  about?: string;
  /** Case-insensitive match over the origin's who / what / where */
  from?: string;
  /** Chapters of this story */
  parentStoryId?: string;
  /** Stories that took longer than this */
  slowerThanMs?: number;
  /** Stories that carry an error or closed at Error level */
  failed?: boolean;
  limit?: number;
  offset?: number;
  /** Newest first unless told otherwise */
  order?: "newest" | "oldest";
};

export type StoryStore = {
  /** Keep a story. Replaces an earlier record with the same id. Never throws synchronously. */
  append(event: StoryEvent | StoredStory): Promise<void>;
  /** One story, complete, by id */
  get(storyId: string): Promise<StoredStory | undefined>;
  /** Stories matching the criteria, newest first by default */
  query(criteria?: StoryQuery): Promise<StoredStory[]>;
  /** The chapters of a story, in the order they were told */
  children(parentStoryId: string): Promise<StoredStory[]>;
  /** Forget stories that began before the boundary; returns how many were removed */
  prune(before: Date): Promise<number>;
};

export type ToStoredStoryOptions = {
  /**
   * Redaction at the storage boundary. The normalizer already redacted at
   * capture; this pass covers a record fed to a store by hand, or one
   * normalized with redaction off, before it becomes durable. Default
   * `balanced`; `off` trusts the record as given.
   */
  redactValues?: RedactionStrictness;
};

const DEFAULT_KEY_SET = new Set(DEFAULT_REDACT_KEYS.map(normalizeKeyForMatching));

/**
 * The record as a store keeps it: a deep copy of the JSON-safe fields, so a
 * caller holding the event cannot change what was stored, and no method rides
 * along. A record without an id — one written before ids existed — is given
 * one. Secrets are redacted once more on the way in: persisted is the moment
 * a leaked value stops being a line that scrolled past.
 */
export function toStoredStory(event: StoryEvent | StoredStory, options: ToStoredStoryOptions = {}): StoredStory {
  const { timestamp, level, title, storyId, parentStoryId, origin, notes, durationMs, droppedEmissions, error } = event;
  const strictness = options.redactValues ?? "balanced";
  const scrub = <T>(value: T): T =>
    strictness === "off"
      ? clone(value)
      : (redactJson(clone(value) as unknown as JsonValue, { redactKeys: DEFAULT_KEY_SET, strictness }) as unknown as T);
  const record: StoredStory = {
    timestamp,
    level,
    title: scrub(title),
    storyId: storyId ?? generateStoryId(),
    notes: scrub(notes) as StoryNote[],
  };
  if (parentStoryId !== undefined) record.parentStoryId = parentStoryId;
  if (origin !== undefined) record.origin = scrub(origin);
  if (durationMs !== undefined) record.durationMs = durationMs;
  if (droppedEmissions !== undefined) record.droppedEmissions = droppedEmissions;
  if (error !== undefined) record.error = scrub(error);
  return record;
}

/** Records are JSON-safe by construction, so a JSON round trip is an exact deep copy */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function generateStoryId(): string {
  const random = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (random) return random.call(globalThis.crypto);
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Everything a full-text search over a story should see: the title, each
 * note's text, scalar context values, and error messages. Adapters store this
 * as the canonical `search_text` column; the in-memory matcher searches it.
 */
export function storySearchText(story: StoredStory): string {
  const parts: string[] = [story.title];
  for (const note of story.notes) {
    parts.push(note.note);
    for (const value of [note.who, note.what, note.where]) {
      if (typeof value === "string") parts.push(value);
    }
    if (note.error?.message) parts.push(note.error.message);
  }
  if (story.error?.message) parts.push(story.error.message);
  return parts.join("\n");
}

/** The origin as three text columns: scalars as-is, objects as JSON */
export function flattenOrigin(origin?: StoryOrigin): { who?: string; what?: string; where?: string } {
  const flat: { who?: string; what?: string; where?: string } = {};
  if (!origin) return flat;
  for (const key of ["who", "what", "where"] as const) {
    const value = origin[key];
    if (value === undefined || value === null) continue;
    flat[key] = typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return flat;
}

/**
 * The canonical schema. An adapter that stores these columns can answer every
 * StoryQuery; `record` carries the whole story so `get` returns it unchanged.
 * Deliberately not a normalized notes table — nothing yet demands one.
 */
export type CanonicalRow = {
  story_id: string;
  parent_story_id: string | null;
  timestamp: string;
  level: StoryLevel;
  title: string;
  origin_who: string | null;
  origin_what: string | null;
  origin_where: string | null;
  duration_ms: number | null;
  error_message: string | null;
  /** The notes, as JSON */
  notes: string;
  /** Derived: what `about` searches */
  search_text: string;
  /** The whole story, as JSON */
  record: string;
};

export function canonicalRow(event: StoryEvent | StoredStory): CanonicalRow {
  const story = toStoredStory(event);
  const origin = flattenOrigin(story.origin);
  return {
    story_id: story.storyId,
    parent_story_id: story.parentStoryId ?? null,
    timestamp: story.timestamp,
    level: story.level,
    title: story.title,
    origin_who: origin.who ?? null,
    origin_what: origin.what ?? null,
    origin_where: origin.where ?? null,
    duration_ms: story.durationMs ?? null,
    error_message: story.error?.message ?? null,
    notes: JSON.stringify(story.notes),
    search_text: storySearchText(story),
    record: JSON.stringify(story),
  };
}

/** Does one story satisfy the criteria? The reference matcher every adapter is measured against. */
export function matchesQuery(story: StoredStory, query: StoryQuery = {}): boolean {
  if (query.since && Date.parse(story.timestamp) < query.since.getTime()) return false;
  if (query.until && Date.parse(story.timestamp) >= query.until.getTime()) return false;
  if (query.level !== undefined) {
    const levels = Array.isArray(query.level) ? query.level : [query.level];
    if (!levels.includes(story.level)) return false;
  }
  if (query.minimumLevel && !meetsLevel(story.level, query.minimumLevel)) return false;
  if (query.parentStoryId !== undefined && story.parentStoryId !== query.parentStoryId) return false;
  if (query.slowerThanMs !== undefined && !((story.durationMs ?? -1) > query.slowerThanMs)) return false;
  if (query.failed !== undefined) {
    const failed = story.level === "Error" || story.error !== undefined;
    if (failed !== query.failed) return false;
  }
  if (query.about) {
    if (!storySearchText(story).toLowerCase().includes(query.about.toLowerCase())) return false;
  }
  if (query.from) {
    const origin = Object.values(flattenOrigin(story.origin)).join("\n").toLowerCase();
    if (!origin.includes(query.from.toLowerCase())) return false;
  }
  return true;
}

/** Filter, order and page a set of stories in memory — what a store without an index does */
export function applyQuery(stories: Iterable<StoredStory>, query: StoryQuery = {}): StoredStory[] {
  // Two stories in the same millisecond keep the order they were kept in,
  // so a page of results is stable across calls and across adapters
  const matched: { story: StoredStory; position: number }[] = [];
  let position = 0;
  for (const story of stories) {
    if (matchesQuery(story, query)) matched.push({ story, position });
    position++;
  }
  const direction = query.order === "oldest" ? 1 : -1;
  matched.sort((a, b) => {
    const byTime = Date.parse(a.story.timestamp) - Date.parse(b.story.timestamp);
    return (byTime !== 0 ? byTime : a.position - b.position) * direction;
  });
  const offset = Math.max(0, query.offset ?? 0);
  const end = query.limit !== undefined ? offset + Math.max(0, query.limit) : undefined;
  return matched.slice(offset, end).map((entry) => entry.story);
}
