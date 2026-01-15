import type { AudienceMember } from "../storyteller";

export function consoleAudience(): AudienceMember {
  return {
    name: "console",
    hear: (event) => {
      const label = "Storyteller:";

      const style =
        event.level === "tell"
          ? "color:#16a34a;font-weight:600"
          : event.level === "warn"
          ? "color:#f59e0b;font-weight:600"
          : "color:#dc2626;font-weight:600";

      console.groupCollapsed(`%c${label}%c ${event.title}`, style, "");
      console.log(event);
      console.groupEnd();
    },
  };
}
