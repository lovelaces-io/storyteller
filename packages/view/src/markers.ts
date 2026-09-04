/**
 * The normalizer leaves explicit markers wherever it changed a value. The view
 * recognises them so a person sees what happened instead of a magic string.
 */
import type { JsonObject, JsonValue } from "./types";

/** Written in place of a value that matched a redacted key name */
export const REDACTED = "[redacted]";
const CIRCULAR_PREFIX = "[Circular → ";
const TRUNCATED_STRING = /…\[\+(\d+) chars\]$/;

export type TruncationMarker = {
  kind: string;
  omitted?: number;
  depth?: number;
};

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The path a circular reference points back to, or undefined for an ordinary string */
export function circularPath(value: string): string | undefined {
  if (!value.startsWith(CIRCULAR_PREFIX) || !value.endsWith("]")) return undefined;
  return value.slice(CIRCULAR_PREFIX.length, -1);
}

/** Split a string the normalizer cut short into what was kept and how much was dropped */
export function truncatedString(value: string): { kept: string; omitted: number } | undefined {
  const match = TRUNCATED_STRING.exec(value);
  if (!match) return undefined;
  return { kept: value.slice(0, match.index), omitted: Number(match[1]) };
}

/** The `@truncated` marker on an object, if it carries one */
export function truncation(value: JsonObject): TruncationMarker | undefined {
  const marker = value["@truncated"];
  if (!isObject(marker) || typeof marker["kind"] !== "string") return undefined;
  const result: TruncationMarker = { kind: marker["kind"] };
  if (typeof marker["omitted"] === "number") result.omitted = marker["omitted"];
  if (typeof marker["depth"] === "number") result.depth = marker["depth"];
  return result;
}

/** True when the object is nothing but a truncation marker */
export function isTruncationOnly(value: JsonObject): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "@truncated" && truncation(value) !== undefined;
}

/** The `@type` tag the normalizer adds to values JSON can't carry natively */
export function typeTag(value: JsonObject): string | undefined {
  const tag = value["@type"];
  return typeof tag === "string" ? tag : undefined;
}

/** What a truncation marker means, in words */
export function describeTruncation(marker: TruncationMarker): string {
  const n = marker.omitted;
  switch (marker.kind) {
    case "array":
      return `${n ?? "more"} more items not kept`;
    case "properties":
      return `${n ?? "more"} more properties not kept`;
    case "mapEntries":
      return `${n ?? "more"} more entries not kept`;
    case "setValues":
      return `${n ?? "more"} more values not kept`;
    case "bytes":
      return `${n ?? "more"} more bytes not kept`;
    case "depth":
      return marker.depth === undefined
        ? "nested too deep to keep"
        : `nested deeper than ${marker.depth} levels, not kept`;
    case "causeChain":
      return "cause chain continues, not kept";
    default:
      return n === undefined ? `${marker.kind} not kept` : `${n} ${marker.kind} not kept`;
  }
}
