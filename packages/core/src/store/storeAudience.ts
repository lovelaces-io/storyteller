import type { AudienceMember, StoryEvent, StoryLevel } from "../storyteller";
import { meetsLevel } from "../environment";
import type { StoryStore } from "./storyStore";

export type StoreAudienceOptions = {
  /** Register under a different name, e.g. to feed two stores */
  name?: string;
  /** Minimum level to keep. Default: everything. */
  level?: StoryLevel;
  /** A further filter, on top of the level */
  accepts?: (event: StoryEvent) => boolean;
};

/**
 * The bridge from delivery to persistence: every story the audience hears is
 * appended to the store, unchanged.
 *
 * Keeps everything by default. Storage that only keeps failures cannot answer
 * "what happened", only "what broke" — and a store has `prune()` for the rest.
 *
 * A store that rejects is reported through `onAudienceError`, like any other
 * audience failure; nothing propagates into the code that told the story.
 *
 * @example
 * ```ts
 * const stories = memoryStore();
 * story.audience.add(storeAudience(stories));
 * // later
 * await stories.query({ failed: true, since: new Date(Date.now() - 3_600_000) });
 * ```
 */
export function storeAudience(store: StoryStore, options: StoreAudienceOptions = {}): AudienceMember {
  return {
    name: options.name ?? "store",
    hears: ["story"],
    accepts: (event) =>
      (options.level === undefined || meetsLevel(event.level, options.level)) &&
      (options.accepts === undefined || options.accepts(event)),
    hear: async (event) => {
      await store.append(event);
    },
  };
}
