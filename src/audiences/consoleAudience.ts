import type { AudienceMember } from "../storyteller";

/**
 * Create an audience that prints stories to the console with color-coded grouped output.
 * Registered by default on every Storyteller instance.
 *
 * @example
 * ```ts
 * // Already included — but you can re-add after removing:
 * story.audience.add(consoleAudience());
 * ```
 */
export function consoleAudience(): AudienceMember {
  return {
    name: "console",
    hear: (event) => {
      const prefix = "Storyteller";

      const style =
        event.level === "tell"
          ? "color:#16a34a;font-weight:600"
          : event.level === "warn"
          ? "color:#f59e0b;font-weight:600"
          : "color:#dc2626;font-weight:600";

      const header = `${prefix}: ${event.title}`;

      console.groupCollapsed(`%c${header}`, style);

      const payload = JSON.stringify(event, null, 2);

      if (event.level === "tell") {
        console.log(header, payload);
      } else if (event.level === "warn") {
        console.warn(header, payload);
      } else {
        console.error(header, payload);
      }

      console.groupEnd();
    },
  };
}
