import type { AudienceMember, StoryEvent } from "../storyteller";

/**
 * Create an audience that stores warn and oops stories via your insert function.
 * Tell-level events are filtered out to reduce noise — only warnings and errors are persisted.
 *
 * Note: if the insert function throws, the error is silently caught by the delivery
 * pipeline (Promise.allSettled). Wrap your insert with try/catch to handle failures.
 *
 * @param insert - Function that receives the story event and stores it
 *
 * @example
 * ```ts
 * story.audience.add(
 *   dbAudience(async (event) => {
 *     await db.insert("story_logs", event);
 *   })
 * );
 * ```
 */
export function dbAudience(insert: (event: StoryEvent) => Promise<void> | void): AudienceMember {
  return {
    name: "db",
    accepts: (event) => event.level === "Warning" || event.level === "Error",
    hear: async (event) => {
      await insert(event);
    },
  };
}
