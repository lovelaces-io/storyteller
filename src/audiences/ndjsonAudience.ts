import type { AudienceMember, Emission, EmissionKind, StoryLevel } from "../storyteller";
import { meetsLevel, resolveMinimumLevel } from "../environment";
import { normalizeValue } from "../normalize";

/** Anything that can take a line of text — a Node stream, or your own sink */
export type LineWriter = {
  write: (chunk: string) => unknown;
};

export type NdjsonAudienceOptions = {
  /** Where lines go. Defaults to stdout in Node, console.log elsewhere. */
  stream?: LineWriter;
  /** Register under a different name, e.g. to run two streams at once */
  name?: string;
  /** Minimum level to write. Defaults to `STORYTELLER_LEVEL`, then everything. */
  level?: StoryLevel;
};

/**
 * Create an audience that writes one JSON object per line — every note and every
 * story, nothing else on the channel.
 *
 * This is the format to give a program: a log shipper, `jq`, or an agent reading
 * another process's output. Each line parses on its own, and `storyId` plus
 * `sequence` let a reader group streamed notes back into their story.
 *
 * @param options - Stream, name and level threshold
 *
 * @example
 * ```ts
 * story.audience.remove("console");
 * story.audience.add(ndjsonAudience({ stream: process.stderr }));
 * ```
 */
export function ndjsonAudience(options: NdjsonAudienceOptions = {}): AudienceMember<EmissionKind> {
  const writer = options.stream ?? createDefaultWriter();
  const minimumLevel = resolveMinimumLevel(options.level);

  return {
    name: options.name ?? "ndjson",
    hears: ["note", "story"],
    accepts: (emission: Emission) => meetsLevel(emission.level, minimumLevel),
    hear: (emission: Emission) => {
      writer.write(`${serializeEmission(emission)}\n`);
    },
  };
}

/**
 * Serialize an emission to a single line, falling back to a normalized copy if the
 * emission somehow resists stringifying. An audience must not be able to throw.
 */
function serializeEmission(emission: Emission): string {
  try {
    return JSON.stringify(emission);
  } catch {
    try {
      return JSON.stringify(normalizeValue(emission));
    } catch {
      return JSON.stringify({
        kind: emission.kind,
        level: emission.level,
        error: "[Unserializable emission]",
      });
    }
  }
}

/** Write to stdout where there is one, and fall back to the console everywhere else */
function createDefaultWriter(): LineWriter {
  const runtime = globalThis as {
    process?: { stdout?: { write?: (chunk: string) => unknown } };
  };

  const write = runtime.process?.stdout?.write;
  if (typeof write === "function") {
    const stdout = runtime.process!.stdout!;
    return { write: (chunk: string) => write.call(stdout, chunk) };
  }

  // console.log adds its own newline, so hand it the line without one
  return { write: (chunk: string) => console.log(chunk.replace(/\n$/, "")) };
}
