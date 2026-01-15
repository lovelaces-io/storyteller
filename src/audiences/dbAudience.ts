import type { AudienceMember, StoryEvent } from "../storyteller";

export function dbAudience(insert: (event: StoryEvent) => Promise<void> | void): AudienceMember {
  return {
    name: "db",
    accepts: (e) => e.level === "warn" || e.level === "oops",
    hear: async (e) => {
      await insert(e);
    },
  };
}
