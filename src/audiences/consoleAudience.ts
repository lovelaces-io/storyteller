import type { AudienceMember } from "../storyteller";

export function consoleAudience(): AudienceMember {
  return {
    name: "console",
    hear: (e) => {
      if (e.level === "oops") console.error(e);
      else if (e.level === "warn") console.warn(e);
      else console.log(e);
    },
  };
}
