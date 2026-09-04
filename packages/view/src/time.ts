/** Time helpers shared by the DOM and text renderers */

export function parseTime(iso: string): Date | undefined {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** A localized timestamp; the raw string when it will not parse, ISO when the zone is invalid */
export function formatTime(locale: string | undefined, timeZone: string | undefined, iso: string): string {
  const date = parseTime(iso);
  if (!date) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "medium",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
