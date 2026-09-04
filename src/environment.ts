import type { StoryLevel } from "./storyteller";

/**
 * Which default audience a storyteller registers.
 *
 * - `text` — colorized console output for a person watching
 * - `ndjson` — one JSON object per line for a program reading
 */
export type OutputFormat = "text" | "ndjson";

/** Rank levels so a minimum threshold can be compared numerically */
const LEVEL_RANK: Record<StoryLevel, number> = {
  Information: 0,
  Warning: 1,
  Error: 2,
};

/** Accepted spellings for a level, in env vars and options alike */
const LEVEL_ALIASES: Record<string, StoryLevel> = {
  info: "Information",
  information: "Information",
  tell: "Information",
  warn: "Warning",
  warning: "Warning",
  oops: "Error",
  error: "Error",
};

/**
 * A level written any of the ways people and agents actually write it.
 * `report("...", { level: "warn" })` should not be a type error.
 */
export type LevelInput =
  | StoryLevel
  | "info"
  | "information"
  | "warn"
  | "warning"
  | "oops"
  | "error";

/**
 * Resolve any accepted level spelling to a stored level label.
 *
 * @param input - A level in any accepted spelling
 * @returns The canonical StoryLevel, defaulting to Information
 */
export function toStoryLevel(input?: LevelInput): StoryLevel {
  if (!input) return "Information";
  return LEVEL_ALIASES[String(input).toLowerCase()] ?? "Information";
}

/**
 * Read an environment variable, tolerating runtimes that have no environment at all.
 *
 * @param name - Variable name
 * @returns The trimmed value, or undefined when unset or unavailable
 */
export function readEnvironmentValue(name: string): string | undefined {
  try {
    const runtime = globalThis as {
      process?: { env?: Record<string, string | undefined> };
    };
    const value = runtime.process?.env?.[name];
    return typeof value === "string" && value.length ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the minimum level to deliver, from an explicit option then `STORYTELLER_LEVEL`.
 *
 * @param requested - Explicit level, if the caller set one
 * @returns The threshold level, defaulting to Information (deliver everything)
 */
export function resolveMinimumLevel(requested?: StoryLevel | string): StoryLevel {
  const value = requested ?? readEnvironmentValue("STORYTELLER_LEVEL");
  if (!value) return "Information";
  return LEVEL_ALIASES[String(value).toLowerCase()] ?? "Information";
}

/**
 * Check whether a level clears the configured minimum.
 *
 * @param level - The emission's level
 * @param minimum - The configured threshold
 */
export function meetsLevel(level: StoryLevel, minimum: StoryLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum];
}

/**
 * Resolve which default audience to register, from an explicit option then
 * `STORYTELLER_FORMAT`.
 *
 * Deliberately not inferred from whether stdout is a TTY: output that silently
 * changes shape when a process is piped is a debugging afternoon nobody asked for.
 *
 * @param requested - Explicit format, if the caller set one
 * @returns The format, defaulting to text
 */
export function resolveOutputFormat(requested?: OutputFormat): OutputFormat {
  const value = requested ?? readEnvironmentValue("STORYTELLER_FORMAT");
  return value === "ndjson" ? "ndjson" : "text";
}

/**
 * Resolve whether to colorize, from an explicit option then `STORYTELLER_COLOR`.
 *
 * @param requested - Explicit choice, if the caller set one
 * @returns Whether colors should be used, defaulting to true
 */
export function resolveColors(requested?: boolean): boolean {
  if (requested !== undefined) return requested;

  const value = readEnvironmentValue("STORYTELLER_COLOR");
  if (value === undefined) return true;

  return !(value === "0" || value.toLowerCase() === "false");
}
