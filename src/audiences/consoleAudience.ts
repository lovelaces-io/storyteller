import type { AudienceMember } from "../storyteller";

export function consoleAudience(): AudienceMember {
  return {
    name: "console",
    hear: (event) => {
      const isTell = event.level === "tell";
      const label = isTell
        ? "Storyteller:"
        : `Storyteller: ${event.level.toUpperCase()} — ${event.title}`;

      const style =
        event.level === "tell"
          ? "color:#16a34a;font-weight:600"
          : event.level === "warn"
          ? "color:#f59e0b;font-weight:600"
          : "color:#dc2626;font-weight:600";

      if (isTell) {
        console.groupCollapsed(
          `%c${label}%c ${event.title}`,
          style,
          ""
        );
      } else {
        console.groupCollapsed(`%c${label}`, style);
      }
      console.log(event);
      console.groupEnd();
    },
  };
}
