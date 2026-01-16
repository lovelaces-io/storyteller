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

      const payload = JSON.stringify(event, null, 2);
      const coloredPayload =
        event.level === "oops" ? `\x1b[38;2;250;128;114m${payload}\x1b[0m` : payload;

      if (event.level === "tell") {
        console.log(header, payload);
      } else if (event.level === "warn") {
        console.warn(header, payload);
      } else {
        console.error(header, coloredPayload);
      }

      console.groupEnd();
    },
  };
}
