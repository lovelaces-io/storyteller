import type { StoryError } from "./storyteller";

/** A value that survives JSON.stringify with no loss and no throwing */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type NormalizeOptions = {
  /** How many levels deep to descend before replacing the value with a truncation marker */
  maxDepth?: number;
  /** How many array entries to keep before truncating */
  maxArrayLength?: number;
  /** How many object properties to keep before truncating */
  maxProperties?: number;
  /** How many characters of a string to keep before truncating */
  maxStringLength?: number;
  /** Property names whose values are replaced with the redaction marker */
  redactKeys?: string[];
  /** Set false to keep secret-shaped values as-is */
  redact?: boolean;
};

/** Marker written in place of a value that matched a redacted key name */
export const REDACTED = "[redacted]";

/**
 * Property names whose values are replaced with {@link REDACTED}.
 * Matching ignores case and separators, so `apiKey`, `api_key` and `API-KEY` all match.
 */
export const DEFAULT_REDACT_KEYS = [
  "password",
  "passphrase",
  "token",
  "secret",
  "apiKey",
  "accessKey",
  "authorization",
  "auth",
  "cookie",
  "sessionId",
  "privateKey",
  "clientSecret",
  "refreshToken",
];

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ARRAY_LENGTH = 100;
const DEFAULT_MAX_PROPERTIES = 100;
const DEFAULT_MAX_STRING_LENGTH = 8000;

/** How far to follow an error's `cause` chain before stopping */
const MAX_CAUSE_DEPTH = 5;
/** How many bytes of a binary value to include as a readable preview */
const BINARY_PREVIEW_BYTES = 16;

type ResolvedOptions = {
  maxDepth: number;
  maxArrayLength: number;
  maxProperties: number;
  maxStringLength: number;
  redactKeys: Set<string>;
  redact: boolean;
};

/**
 * Convert any value into a JSON-safe structure suitable for a story record.
 *
 * Handles the shapes real code actually holds — errors, dates, maps, sets, class
 * instances, binary buffers, circular references, throwing getters — and never throws,
 * so a hostile object logged by a caller cannot break the delivery pipeline.
 *
 * Data dropped for size is replaced with an explicit `@truncated` marker rather than
 * disappearing silently, so a consumer can tell the difference between "this was empty"
 * and "this was too big".
 *
 * @param input - Any value
 * @param options - Depth, size and redaction limits
 * @returns A value that JSON.stringify can always serialize
 *
 * @example
 * ```ts
 * normalizeValue({ user: new Map([["id", 1]]), apiKey: "sk-live-abc" });
 * // { user: { "@type": "Map", entries: { id: 1 } }, apiKey: "[redacted]" }
 * ```
 */
export function normalizeValue(
  input: unknown,
  options: NormalizeOptions = {}
): JsonValue {
  const resolved: ResolvedOptions = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxArrayLength: options.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH,
    maxProperties: options.maxProperties ?? DEFAULT_MAX_PROPERTIES,
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
    redactKeys: new Set(
      (options.redactKeys ?? DEFAULT_REDACT_KEYS).map(normalizeKeyForMatching)
    ),
    redact: options.redact ?? true,
  };

  try {
    return normalizeUnknown(input, resolved, 0, "$", new Map());
  } catch (failure) {
    // The normalizer must never throw into the delivery pipeline
    return `[Unreadable: ${describeFailure(failure)}]`;
  }
}

/**
 * Convert an unknown thrown value into a serializable StoryError,
 * following the `cause` chain and collecting AggregateError members.
 *
 * @param rawError - Any thrown or rejected value
 * @param options - Depth, size and redaction limits applied to attached data
 * @returns A StoryError safe to store and serialize
 */
export function normalizeError(
  rawError: unknown,
  options: NormalizeOptions = {}
): StoryError {
  const resolved: ResolvedOptions = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxArrayLength: options.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH,
    maxProperties: options.maxProperties ?? DEFAULT_MAX_PROPERTIES,
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
    redactKeys: new Set(
      (options.redactKeys ?? DEFAULT_REDACT_KEYS).map(normalizeKeyForMatching)
    ),
    redact: options.redact ?? true,
  };

  return normalizeErrorInternal(rawError, resolved, 0);
}

/** Build a StoryError from any thrown value, bounded by the cause-chain depth */
function normalizeErrorInternal(
  rawError: unknown,
  options: ResolvedOptions,
  causeDepth: number
): StoryError {
  if (!(rawError instanceof Error)) {
    if (isPlainRecord(rawError)) {
      // Error-shaped objects from across a serialization boundary are common
      const record = rawError as Record<string, unknown>;
      const message = typeof record["message"] === "string" ? record["message"] : undefined;
      const name = typeof record["name"] === "string" ? record["name"] : undefined;
      if (message !== undefined || name !== undefined) {
        return {
          ...(name !== undefined ? { name } : {}),
          ...(message !== undefined ? { message } : {}),
        };
      }
    }
    return { message: safeStringify(rawError, options.maxStringLength) };
  }

  const normalized: StoryError = {
    name: rawError.name,
    message: rawError.message,
  };

  if (rawError.stack !== undefined) {
    normalized.stack = truncateString(rawError.stack, options.maxStringLength);
  }

  const cause = (rawError as { cause?: unknown }).cause;
  if (cause !== undefined) {
    if (causeDepth >= MAX_CAUSE_DEPTH) {
      normalized.cause = { "@truncated": { kind: "causeChain" } };
    } else if (cause instanceof Error) {
      normalized.cause = normalizeErrorInternal(cause, options, causeDepth + 1);
    } else {
      normalized.cause = normalizeUnknown(cause, options, 0, "$.cause", new Map());
    }
  }

  const aggregated = (rawError as { errors?: unknown }).errors;
  if (Array.isArray(aggregated)) {
    normalized.errors = aggregated
      .slice(0, options.maxArrayLength)
      .map((member) => normalizeErrorInternal(member, options, causeDepth + 1));
  }

  return normalized;
}

/** Recursively convert a value, tracking ancestors so cycles become readable markers */
function normalizeUnknown(
  value: unknown,
  options: ResolvedOptions,
  depth: number,
  path: string,
  ancestors: Map<object, string>
): JsonValue {
  if (value === null) return null;

  const valueType = typeof value;

  if (valueType === "string") {
    return truncateString(value as string, options.maxStringLength);
  }

  if (valueType === "number") {
    // NaN and Infinity are not representable in JSON
    return Number.isFinite(value as number) ? (value as number) : String(value);
  }

  if (valueType === "boolean") return value as boolean;
  if (valueType === "undefined") return null;
  if (valueType === "bigint") return `${String(value)}n`;
  if (valueType === "symbol") return String(value as symbol);

  if (valueType === "function") {
    const name = (value as { name?: string }).name;
    return `[Function: ${name ? name : "anonymous"}]`;
  }

  const objectValue = value as object;

  const existingPath = ancestors.get(objectValue);
  if (existingPath !== undefined) {
    return `[Circular → ${existingPath}]`;
  }

  if (depth > options.maxDepth) {
    return { "@truncated": { kind: "depth", depth: options.maxDepth } };
  }

  const wellKnown = normalizeWellKnown(objectValue, options, depth, path, ancestors);
  if (wellKnown !== undefined) return wellKnown;

  ancestors.set(objectValue, path);
  try {
    if (Array.isArray(objectValue)) {
      return normalizeArray(objectValue, options, depth, path, ancestors);
    }
    return normalizeObject(objectValue, options, depth, path, ancestors);
  } finally {
    // Only ancestors count as cycles — the same object appearing twice in a
    // tree is repetition, not recursion, and should render both times
    ancestors.delete(objectValue);
  }
}

/**
 * Convert the built-in object types that need a dedicated shape.
 * Returns undefined when the value is an ordinary array or object.
 */
function normalizeWellKnown(
  value: object,
  options: ResolvedOptions,
  depth: number,
  path: string,
  ancestors: Map<object, string>
): JsonValue | undefined {
  if (value instanceof Error) {
    return normalizeErrorInternal(value, options, 0) as unknown as JsonValue;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? "[Invalid Date]" : value.toISOString();
  }

  if (value instanceof RegExp) return String(value);
  if (value instanceof URL) return value.href;

  if (value instanceof Map) {
    const entries: Record<string, JsonValue> = {};
    let index = 0;
    let omitted = 0;
    for (const [entryKey, entryValue] of value) {
      if (index >= options.maxProperties) {
        omitted += 1;
        continue;
      }
      const keyLabel = safeStringify(entryKey, options.maxStringLength);
      entries[keyLabel] = redactOrNormalize(
        keyLabel,
        entryValue,
        options,
        depth + 1,
        `${path}.${keyLabel}`,
        ancestors
      );
      index += 1;
    }
    return {
      "@type": "Map",
      entries,
      ...(omitted ? { "@truncated": { kind: "mapEntries", omitted } } : {}),
    };
  }

  if (value instanceof Set) {
    const values: JsonValue[] = [];
    let omitted = 0;
    for (const member of value) {
      if (values.length >= options.maxArrayLength) {
        omitted += 1;
        continue;
      }
      values.push(
        normalizeUnknown(member, options, depth + 1, `${path}[${values.length}]`, ancestors)
      );
    }
    return {
      "@type": "Set",
      values,
      ...(omitted ? { "@truncated": { kind: "setValues", omitted } } : {}),
    };
  }

  if (value instanceof WeakMap) return "[WeakMap]";
  if (value instanceof WeakSet) return "[WeakSet]";
  if (value instanceof Promise) return "[Promise]";

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return describeBinary(value);
  }

  const converted = callToJson(value);
  if (converted !== undefined) {
    return normalizeUnknown(converted, options, depth, path, ancestors);
  }

  return undefined;
}

/** Call a value's toJSON() if it has one, returning undefined when it has none or it throws */
function callToJson(value: object): unknown {
  let toJson: unknown;
  try {
    toJson = (value as { toJSON?: unknown }).toJSON;
  } catch {
    return undefined;
  }

  if (typeof toJson !== "function") return undefined;

  try {
    return (toJson as () => unknown).call(value);
  } catch (failure) {
    return `[Unreadable: ${describeFailure(failure)}]`;
  }
}

/** Describe a binary value by its size and leading bytes rather than dumping its contents */
function describeBinary(value: ArrayBufferView | ArrayBuffer): JsonValue {
  const typeName = readConstructorName(value) ?? "ArrayBuffer";
  const byteLength = value.byteLength;

  let preview: string;
  try {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value, 0, Math.min(BINARY_PREVIEW_BYTES, byteLength))
        : new Uint8Array(
            value.buffer,
            value.byteOffset,
            Math.min(BINARY_PREVIEW_BYTES, value.byteLength)
          );
    preview = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  } catch {
    preview = "";
  }

  return {
    "@type": typeName,
    byteLength,
    ...(preview ? { preview } : {}),
    ...(byteLength > BINARY_PREVIEW_BYTES
      ? { "@truncated": { kind: "bytes", omitted: byteLength - BINARY_PREVIEW_BYTES } }
      : {}),
  };
}

/** Convert an array, keeping at most maxArrayLength entries */
function normalizeArray(
  value: unknown[],
  options: ResolvedOptions,
  depth: number,
  path: string,
  ancestors: Map<object, string>
): JsonValue {
  const kept: JsonValue[] = [];
  const limit = Math.min(value.length, options.maxArrayLength);

  for (let index = 0; index < limit; index += 1) {
    kept.push(
      normalizeUnknown(value[index], options, depth + 1, `${path}[${index}]`, ancestors)
    );
  }

  if (value.length > limit) {
    kept.push({ "@truncated": { kind: "array", omitted: value.length - limit } });
  }

  return kept;
}

/** Convert a plain object or class instance, tagging the class name when there is one */
function normalizeObject(
  value: object,
  options: ResolvedOptions,
  depth: number,
  path: string,
  ancestors: Map<object, string>
): JsonValue {
  const result: Record<string, JsonValue> = {};

  const className = readConstructorName(value);
  if (className && className !== "Object") {
    result["@type"] = className;
  }

  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    return `[Unreadable: keys could not be listed]`;
  }

  let kept = 0;
  let omitted = 0;
  for (const key of keys) {
    if (kept >= options.maxProperties) {
      omitted += 1;
      continue;
    }

    let propertyValue: unknown;
    try {
      propertyValue = (value as Record<string, unknown>)[key];
    } catch (failure) {
      // A getter that throws must not take the whole record down with it
      result[key] = `[Unreadable: ${describeFailure(failure)}]`;
      kept += 1;
      continue;
    }

    // JSON.stringify drops undefined properties; match that so records stay clean
    if (propertyValue === undefined) continue;

    result[key] = redactOrNormalize(
      key,
      propertyValue,
      options,
      depth + 1,
      `${path}.${key}`,
      ancestors
    );
    kept += 1;
  }

  // Only count properties dropped for the size limit — a property skipped because
  // its value was undefined is absent from JSON.stringify output too, not truncated
  if (omitted) {
    result["@truncated"] = { kind: "properties", omitted };
  }

  return result;
}

/** Replace secret-shaped values with the redaction marker, otherwise normalize normally */
function redactOrNormalize(
  key: string,
  value: unknown,
  options: ResolvedOptions,
  depth: number,
  path: string,
  ancestors: Map<object, string>
): JsonValue {
  if (options.redact && options.redactKeys.has(normalizeKeyForMatching(key))) {
    return REDACTED;
  }
  return normalizeUnknown(value, options, depth, path, ancestors);
}

/** Reduce a property name to letters and digits so casing and separators do not matter */
function normalizeKeyForMatching(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Read a value's class name, tolerating null-prototype objects and hostile proxies */
function readConstructorName(value: object): string | undefined {
  try {
    const prototype = Object.getPrototypeOf(value) as { constructor?: { name?: string } } | null;
    if (prototype === null) return undefined;
    const name = prototype.constructor?.name;
    return typeof name === "string" && name.length ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Check whether a value is a non-array object with an ordinary prototype */
function isPlainRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Cut a string to length, marking inline how many characters were dropped */
function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…[+${value.length - maxLength} chars]`;
}

/** Convert any value to a short string without risking a throw from a custom toString */
function safeStringify(value: unknown, maxLength: number): string {
  try {
    return truncateString(String(value), maxLength);
  } catch {
    return "[unstringifiable]";
  }
}

/** Extract a readable message from a value thrown while normalizing */
function describeFailure(failure: unknown): string {
  if (failure instanceof Error && failure.message) return failure.message;
  try {
    return String(failure);
  } catch {
    return "unknown error";
  }
}
