import type { StoryEvent } from "../storyteller";
import type { StoredStory, StoryQuery, StoryStore } from "./storyStore";
import { applyQuery, toStoredStory } from "./storyStore";

export type MemoryStoreOptions = {
  /**
   * How many stories to keep before the oldest are forgotten. A process that
   * runs for a month must not grow without bound. Default 10 000.
   */
  capacity?: number;
};

export type MemoryStore = StoryStore & {
  /** How many stories are kept right now */
  readonly size: number;
  /** Forget everything */
  clear(): void;
};

/**
 * The reference StoryStore: a Map, no dependencies, browser-safe.
 *
 * Every other adapter is measured against this one — same query, same
 * results. It is also the right store for tests, for a CLI run that reads its
 * own stories back before exiting, and for a browser session.
 */
export function memoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  const capacity = Math.max(1, options.capacity ?? 10_000);
  const stories = new Map<string, StoredStory>();

  return {
    get size() {
      return stories.size;
    },
    clear() {
      stories.clear();
    },
    async append(event: StoryEvent | StoredStory) {
      const record = toStoredStory(event);
      // Re-insert so a replaced story counts as the newest for eviction
      stories.delete(record.storyId);
      stories.set(record.storyId, record);
      while (stories.size > capacity) {
        const oldest = stories.keys().next().value;
        if (oldest === undefined) break;
        stories.delete(oldest);
      }
    },
    async get(storyId: string) {
      return stories.get(storyId);
    },
    async query(criteria: StoryQuery = {}) {
      return applyQuery(stories.values(), criteria);
    },
    async children(parentStoryId: string) {
      return applyQuery(stories.values(), { parentStoryId, order: "oldest" });
    },
    async prune(before: Date) {
      const boundary = before.getTime();
      let removed = 0;
      for (const [id, story] of stories) {
        if (Date.parse(story.timestamp) < boundary) {
          stories.delete(id);
          removed++;
        }
      }
      return removed;
    },
  };
}
