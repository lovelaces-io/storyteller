/**
 * The view's input contract.
 *
 * These mirror the records @lovelaces-io/storyteller emits and store, declared
 * here structurally so the view has no dependency on core: a `StoryEvent`
 * straight from an audience, a story parsed back from NDJSON or a database,
 * and a `NoteEmission` from live narration all satisfy them. The contract test
 * in test/contract.test.ts proves that against the real library.
 */

/** A value as the normalizer produces it — JSON with no loss and no throwing */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type Level = "Information" | "Warning" | "Error";

export type ErrorRecord = {
  name?: string;
  message?: string;
  stack?: string;
  /** A nested error, a plain value, or a `@truncated` marker once the chain is capped */
  cause?: JsonValue;
  /** Members of an AggregateError */
  errors?: ErrorRecord[];
};

export type OriginRecord = {
  who?: JsonValue;
  what?: JsonValue;
  where?: JsonValue;
};

/** A note as stored in a story, or as emitted live (the extra fields) */
export type NoteRecord = {
  timestamp: string;
  /** Position within the story, gap-free from 0. Absent on records written before sequencing existed. */
  sequence?: number;
  note: string;
  /** Absent when the note carries the story's default Information level */
  level?: Level;
  who?: JsonValue;
  what?: JsonValue;
  where?: JsonValue;
  error?: ErrorRecord;
  /** Present on a live emission */
  kind?: "note";
  storyId?: string;
  parentStoryId?: string;
  origin?: OriginRecord;
};

/** A story as emitted by `finish()` or read back from wherever it was kept */
export type StoryRecord = {
  timestamp: string;
  level: Level;
  title: string;
  storyId?: string;
  /** The story this one is a chapter of */
  parentStoryId?: string;
  origin?: OriginRecord;
  notes: NoteRecord[];
  durationMs?: number;
  /** Emissions lost to back-pressure while the story was collected */
  droppedEmissions?: number;
  error?: ErrorRecord;
  /** Present on a live emission */
  kind?: "story";
};
