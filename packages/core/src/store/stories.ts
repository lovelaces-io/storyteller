/**
 * The query vocabulary: ask a store a question in the library's own words.
 *
 *   await stories(store).about("checkout").from("payment-service").failing().since("24h");
 *
 * The same words have to read well aloud and be easy for a model to write.
 * Every clause returns a new builder; a builder compiles to a StoryQuery, so
 * an adapter receives structured criteria and never a string to parse.
 */
import type { LevelInput } from "../environment";
import { toStoryLevel } from "../environment";
import type { StoredStory, StoryQuery, StoryStore } from "./storyStore";

/** `"30s"`, `"5m"`, `"24h"`, `"7d"`, `"2w"`, or milliseconds */
export type DurationInput = string | number;

const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** A duration as milliseconds. Throws on something that is not a duration, so a typo cannot become "since forever". */
export function parseDuration(input: DurationInput): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new RangeError(`Not a duration: ${input}`);
    return input;
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)\s*$/i.exec(input);
  if (!match) throw new RangeError(`Not a duration: "${input}" (expected e.g. "30s", "5m", "24h", "7d", "2w")`);
  return Number(match[1]) * UNITS[match[2]!.toLowerCase()]!;
}

export type StoriesOptions = {
  /** The clock `since("24h")` counts back from. Injectable for tests. */
  now?: () => Date;
};

/**
 * A question in progress. Immutable: every clause returns a new one.
 * Awaiting it runs `.all()`.
 *
 * Being thenable has one consequence: returning a builder from an `async`
 * function resolves it into its results. Return the store, or the
 * `toQuery()` object, when a caller should get the question rather than
 * the answer.
 */
export class StoryQueryBuilder implements PromiseLike<StoredStory[]> {
  constructor(
    private readonly store: StoryStore,
    private readonly query: StoryQuery,
    private readonly now: () => Date
  ) {}

  private with(patch: StoryQuery): StoryQueryBuilder {
    return new StoryQueryBuilder(this.store, { ...this.query, ...patch }, this.now);
  }

  private instant(input: DurationInput | Date): Date {
    return input instanceof Date ? input : new Date(this.now().getTime() - parseDuration(input));
  }

  /** Title, note text, scalar context or error message mentions this */
  about(text: string): StoryQueryBuilder {
    return this.with({ about: text });
  }

  /** The origin — who, what or where — mentions this */
  from(origin: string): StoryQueryBuilder {
    return this.with({ from: origin });
  }

  /** Exactly this level. Accepts the aliases: `"info"`, `"warn"`, `"oops"`. */
  level(level: LevelInput): StoryQueryBuilder {
    return this.with({ level: toStoryLevel(level) });
  }

  /** This level or worse */
  atLeast(level: LevelInput): StoryQueryBuilder {
    return this.with({ minimumLevel: toStoryLevel(level) });
  }

  /** Carried an error, or closed at Error level */
  failing(): StoryQueryBuilder {
    return this.with({ failed: true });
  }

  /** Neither an error nor closed at Error level */
  succeeding(): StoryQueryBuilder {
    return this.with({ failed: false });
  }

  /** Took longer than this: `"5s"`, `"2m"`, or milliseconds */
  slowerThan(duration: DurationInput): StoryQueryBuilder {
    return this.with({ slowerThanMs: parseDuration(duration) });
  }

  /** Began within this long ago (`"24h"`), or at or after this date */
  since(when: DurationInput | Date): StoryQueryBuilder {
    return this.with({ since: this.instant(when) });
  }

  /** Began before this long ago, or before this date */
  until(when: DurationInput | Date): StoryQueryBuilder {
    return this.with({ until: this.instant(when) });
  }

  /** The chapters of this story */
  under(parentStoryId: string): StoryQueryBuilder {
    return this.with({ parentStoryId });
  }

  /** Most recent first — the default */
  newest(): StoryQueryBuilder {
    return this.with({ order: "newest" });
  }

  /** Earliest first */
  oldest(): StoryQueryBuilder {
    return this.with({ order: "oldest" });
  }

  /** At most this many */
  limit(count: number): StoryQueryBuilder {
    return this.with({ limit: count });
  }

  /** Skip this many first */
  skip(count: number): StoryQueryBuilder {
    return this.with({ offset: count });
  }

  /** The structured criteria this question compiles to — what an adapter receives */
  toQuery(): StoryQuery {
    return { ...this.query };
  }

  /** Every matching story */
  all(): Promise<StoredStory[]> {
    return this.store.query(this.toQuery());
  }

  /** The first match, or nothing */
  async first(): Promise<StoredStory | undefined> {
    const [story] = await this.store.query({ ...this.query, limit: 1 });
    return story;
  }

  /** How many match, ignoring paging */
  async count(): Promise<number> {
    const { limit: _limit, offset: _offset, ...unpaged } = this.query;
    return (await this.store.query(unpaged)).length;
  }

  /** An awaited builder resolves to `.all()` */
  then<Result = StoredStory[], Failure = never>(
    onFulfilled?: ((stories: StoredStory[]) => Result | PromiseLike<Result>) | null,
    onRejected?: ((reason: unknown) => Failure | PromiseLike<Failure>) | null
  ): Promise<Result | Failure> {
    return this.all().then(onFulfilled, onRejected);
  }
}

/**
 * Start a question against a store.
 *
 * @example
 * ```ts
 * const recent = stories(store);
 * await recent.failing().since("1h");
 * await recent.about("checkout").from("payment-service").level("oops").since("24h");
 * await recent.slowerThan("5s").since("7d").oldest().limit(10);
 * await recent.under(parentStoryId).count();
 * ```
 */
export function stories(store: StoryStore, options: StoriesOptions = {}): StoryQueryBuilder {
  return new StoryQueryBuilder(store, {}, options.now ?? (() => new Date()));
}
