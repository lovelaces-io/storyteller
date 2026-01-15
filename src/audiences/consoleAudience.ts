import type { AudienceMember } from "../storyteller";

export function consoleAudience(): AudienceMember {
  return {
    name: "console",
    hear: (event) => {
      const label = "Storyteller";

      const style =
        event.level === "tell"
          ? "color:#16a34a;font-weight:600"
          : event.level === "warn"
          ? "color:#f59e0b;font-weight:600"
          : "color:#dc2626;font-weight:600";

      const header = `${label}: ${event.title}`;

      console.groupCollapsed(`%c${header}`, style);

      if (event.level === "tell") {
        console.log(header, event);
      } else if (event.level === "warn") {
        console.warn(header, event);
      } else {
        console.error(header, event); // ✅ string first, object second
      }

      console.groupEnd();
    },
  };
}
