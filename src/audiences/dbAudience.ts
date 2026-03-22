import type { AudienceMember, StoryEvent } from "../storyteller";

/** Create an audience that persists warn and oops stories to a database via the provided insert function */
export function dbAudience(insert: (event: StoryEvent) => Promise<void> | void): AudienceMember {
  return {
    name: "db",
    accepts: (event) => event.level === "warn" || event.level === "oops",
    hear: async (event) => {
      await insert(event);
    },
  };
}
