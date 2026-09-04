# Storyteller API Reference

Complete API reference for `@lovelaces-io/storyteller`.

```ts
import {
  Storyteller,
  useStoryteller,
  formatStory,
  writeStoryReport,
  consoleAudience,
  dbAudience,
  ndjsonAudience,
  normalizeValue,
  normalizeError,
  formatDuration,
} from "@lovelaces-io/storyteller";
```

---

## Storyteller

The core class. You report beats of work as they happen; `finish()` emits them as one structured story record — and in live narration, each beat is emitted the moment it's reported.

### Constructor

```ts
new Storyteller(options?: {
  origin?: { who?: unknown; what?: unknown; where?: unknown };
  audiences?: AudienceMember[];
  narration?: "collected" | "live";
  format?: "text" | "ndjson";
  level?: LevelInput;
  onAudienceError?: (error, member, emission) => void;
  maxInFlight?: number;
})
```

The `origin` is attached to every story emitted by this instance, and is normalized like any other context. Additional audiences passed here are added on top of the default.

| Option | Default | Environment variable |
|---|---|---|
| `narration` | `"collected"` | `STORYTELLER_NARRATION` |
| `format` | `"text"` | `STORYTELLER_FORMAT` |
| `level` | `"Information"` | `STORYTELLER_LEVEL` |
| `onAudienceError` | throttled console warning | — |
| `maxInFlight` | `1000` | — |
| `audience` | — | — |

`audience` shares another storyteller's `AudienceRegistry` instead of creating one; audiences added to it later reach this storyteller too, and no default audience is registered. This is what `chapter()` uses. `AudienceRegistry` is exported.

The `format` option decides which default audience is registered: `consoleAudience()` for `text`, `ndjsonAudience()` for `ndjson`. Unrecognized environment values fall back to the default rather than throwing.

```ts
const story = new Storyteller({
  origin: {
    where: { app: "checkout", page: "Payment" },
  },
});
```

---

### story.report(input, context?)

Report a beat of the current story. Returns `this` for chaining.

```ts
story.report(input: unknown, context?: {
  who?: unknown;
  what?: unknown;
  where?: unknown;
  error?: unknown;
  level?: LevelInput;
  live?: boolean;
  to?: string[];
}): this
```

In `collected` narration the beat is buffered and leaves with the story. In `live` narration it is emitted immediately, and still appears in the story record at the end.

`input` accepts any value. A string is its own text; anything else is normalized, with the note text derived from a `message` / `title` / `name` / `summary` field or the value's type.

```ts
story.report("Card charged", { what: { amount: "$42" }, where: "stripe" });
story.report(await response.json());
story.report(caughtError);
story.report("Retrying", { level: "warn" });
story.report("Urgent", { live: true, to: ["ndjson"] });
```

`level` accepts `"info"`, `"warn"`, `"oops"`, `"error"`, or a stored `StoryLevel` label. It is omitted from the record when it is the default `Information`.

---

### story.finish(title, options?)

Emit everything collected so far as one story record, then start a fresh story.

```ts
story.finish(title: string, options?: {
  level?: LevelInput;
  error?: unknown;
}): { to: (...audienceNames: string[]) => void }
```

```ts
story.finish("Sync complete");
story.finish("Sync slow", { level: "warn" });
story.finish("Sync failed", { level: "oops", error }).to("db");
```

Delivery is microtask-scheduled so `.to()` can override the audience list synchronously. See [.to()](#toaudiencenames--targeting-audiences).

---

### story.narrate(mode)

Switch narration at runtime. Takes effect on the next `report()`; already-buffered beats are not replayed. Returns `this`.

```ts
story.narrate("live");
story.narrate("collected");
```

---

### story.chapter(options?)

Start a chapter: a child `Storyteller` whose stories link back to this one by `parentStoryId`.

```ts
story.chapter(options?: {
  origin?: StoryOriginInput;      // merged over the parent's
  narration?: Narration;
  level?: LevelInput;
  onAudienceError?: AudienceErrorHandler;
  maxInFlight?: number;
}): Storyteller
```

```ts
for (const account of accounts) {
  const chapter = story.chapter({ origin: { what: account.id } });
  chapter.report("Fetching invoices");
  chapter.finish(`Synced ${account.id}`);
}
```

The child **shares the parent's audience registry**, so audiences added to the parent later reach the chapter too, and removing one removes it for chapters as well. Settings are inherited unless overridden.

`parentStoryId` is captured when the chapter is created, so a parent that finishes first does not orphan its chapters. Chapters emit their own records — they are not folded into the parent's notes.

---

### story.currentStoryId

The id currently being stamped on beats and on the next story record. Read-only.

```ts
const id = story.currentStoryId;
```

---

### story.note(text, data?)

> **Deprecated.** Use [`story.report()`](#storyreportinput-context). Removed at 1.0.

<!-- docs-check: allow-deprecated -->


Add a timestamped note to the current story.

```ts
note(text: string, data?: {
  who?: string | Record<string, unknown>;
  what?: string | Record<string, unknown>;
  where?: string | Record<string, unknown>;
  error?: unknown;
}): Storyteller
```

Returns `this` for chaining.

```ts
story.report("User submitted form");

story.report("Validation failed", {
  who: { id: "user:42", role: "admin" },
  what: { field: "email", reason: "invalid format" },
  where: { component: "SignupForm" },
  error: new Error("invalid email"),
});

// Chaining
story
  .report("Step 1")
  .report("Step 2")
  .report("Step 3");
```

---

### story.tell(title)

> **Deprecated.** Use `story.finish(title)`. Removed at 1.0.

<!-- docs-check: allow-deprecated -->


Emit a story at the `"tell"` level (success / informational).

```ts
tell(title: string): { to: (...audienceNames: string[]) => void }
```

Collects all accumulated notes, emits the story to all audiences, and clears the notes.

```ts
story.report("Page rendered");
story.report("Data loaded");
story.finish("Dashboard ready");
// notes are now cleared for the next story
```

---

### story.warn(title)

> **Deprecated.** Use `story.finish(title, { level: "warn" })`. Removed at 1.0.

<!-- docs-check: allow-deprecated -->


Emit a story at the `Warning` level.

```ts
warn(title: string): { to: (...audienceNames: string[]) => void }
```

```ts
story.report("Response took 4200ms");
story.warn("API response slow");
```

---

### story.oops(title, error?)

> **Deprecated.** Use `story.finish(title, { level: "oops", error })`. Removed at 1.0.

<!-- docs-check: allow-deprecated -->


Emit a story at the `Error` level. Optionally attach an error object.

```ts
oops(title: string, error?: unknown): { to: (...audienceNames: string[]) => void }
```

```ts
try {
  await saveProfile(data);
} catch (error) {
  story.report("Write failed", { where: "primary-db", error });
  story.finish("Failed to save profile", { level: "oops", error });
}
```

---

### .to(...audienceNames) — Targeting Audiences

`finish()` — and the deprecated `tell()`, `warn()`, and `oops()` aliases — return an object with a `.to()` method. Call it synchronously to deliver the story only to specific audiences instead of all registered ones.

```ts
// Deliver to all audiences (default)
story.finish("Page loaded");

// Deliver only to "console" and "db"
story.finish("Critical failure", { level: "oops", error }).to("console", "db");

// Deliver only to "db" (skip console)
story.finish("Slow query", { level: "warn" }).to("db");
```

If `.to()` is not called, the story is delivered to all audiences via microtask.

---

### story.summarize(options?)

Generate a formatted summary of the current notes without emitting or clearing them.

```ts
summarize(options?: {
  title?: string;      // default: "Story preview"
  level?: StoryLevel;  // default: "tell"
  error?: unknown;
  timezone?: string;   // default: local timezone
  locale?: string;     // default: "en-US"
  detail?: "brief" | "normal" | "full";  // default: "normal"
  noteLimit?: number;   // default: 50
  showData?: boolean;  // default: true
  colors?: boolean;  // default: true
}): FormattedReport
```

Returns `{ text: string, data: StoryReport }`.

> **Deprecated aliases:** `StorySummaryData` is a deprecated alias for `StoryReport`. `FormattedReport` was previously named `StorySummary`.

```ts
story.report("User opened page");
story.report("Widgets loaded", { what: { count: 6 } });

const summary = story.summarize({
  title: "Dashboard status",
  level: "tell",
  detail: "full",
});

console.log(summary.text);  // Formatted, colorized text block
console.log(summary.data);  // Structured StoryReport object

// Notes are still here — summarize doesn't clear them
story.finish("Dashboard ready");  // This story includes the same notes
```

---

### story.reset()

Clear all accumulated notes without emitting a story.

```ts
reset(): Storyteller
```

```ts
story.report("Starting process");
story.report("Cancelled by user");
story.reset();  // discard notes, start fresh
```

---

### story.audience

The audience registry. Manages where stories are delivered.

```ts
// Add an audience
story.audience.add({
  name: "analytics",
  hear: (event) => trackEvent(event),
});

// Add with filtering
story.audience.add({
  name: "slack",
  accepts: (event) => event.level === "Error",
  hear: async (event) => postToSlack(event),
});

// Remove an audience
story.audience.remove("console");

// Check if an audience is registered
story.audience.has("console");  // true or false

// List all registered audience names
story.audience.names();  // ["console", "db", ...]
```

---

## useStoryteller(options?)

Returns a shared singleton `Storyteller` instance. Useful for cross-component or cross-service logging where you want all notes to flow into the same story.

```ts
useStoryteller(options?: {
  origin?: StoryEventBase["origin"];
  reset?: boolean;
}): Storyteller
```

```ts
// First call creates the shared instance
const story = useStoryteller({
  origin: { where: { app: "admin" } },
});

// Subsequent calls return the same instance
const same = useStoryteller();
// same === story

// Pass reset: true to reinitialize
const fresh = useStoryteller({
  origin: { where: { app: "admin-v2" } },
  reset: true,
});
```

---

## Built-in Audiences

### consoleAudience()

Logs stories to the browser console with color-coded grouped output. Registered by default on every `Storyteller` instance.

```ts
consoleAudience(): AudienceMember
```

- `"tell"` events use `console.log` (green header)
- `"warn"` events use `console.warn` (yellow header)
- `"oops"` events use `console.error` (red header)
- All events are wrapped in `console.groupCollapsed`

```ts
// Already registered by default — no action needed.
// To re-add after removing:
story.audience.add(consoleAudience());
```

---

### dbAudience(insertFunction)

Persists stories to a database. Only accepts `"warn"` and `"oops"` events by default.

```ts
dbAudience(
  insert: (event: StoryEvent) => Promise<void> | void
): AudienceMember
```

```ts
import { dbAudience } from "@lovelaces-io/storyteller";

story.audience.add(
  dbAudience(async (event) => {
    await db.insert("story_events", {
      title: event.title,
      level: event.level,
      timestamp: event.timestamp,
      payload: JSON.stringify(event),
    });
  })
);

// "Information" events are filtered out — only "Warning" and "Error" persist
story.finish("Page loaded");           // NOT sent to db
story.finish("Slow response", { level: "warn" });   // Sent to db
story.finish("Crash", { level: "oops", error });    // Sent to db
```

---

### ndjsonAudience(options?)

An audience that writes one JSON object per line — every beat and every story, nothing else on the channel. This is the format to hand a program: a log shipper, `jq`, or another agent reading a subprocess.

```ts
ndjsonAudience(options?: {
  stream?: { write: (chunk: string) => unknown };
  name?: string;
  level?: LevelInput;
}): AudienceMember
```

```ts
story.audience.remove("console");
story.audience.add(ndjsonAudience({ stream: process.stderr }));
```

Defaults to `process.stdout` in Node and `console.log` elsewhere. Hears both notes and stories. Registered automatically when `format` is `"ndjson"` or `STORYTELLER_FORMAT=ndjson`.

Serialization can never throw: a value that resists `JSON.stringify` is normalized first, and failing that, replaced with a marker line.

---

## normalizeValue(input, options?)

Turn any value into a JSON-safe structure. Called for you on everything passed to `report()`, and exported for when you need it directly.

```ts
normalizeValue(input: unknown, options?: {
  maxDepth?: number;          // 6
  maxArrayLength?: number;    // 100
  maxProperties?: number;     // 100
  maxStringLength?: number;   // 8000
  redactKeys?: string[];
  redact?: boolean;           // true
}): JsonValue
```

| Input | Output |
|---|---|
| `Error` (incl. `AggregateError`, `cause` chain) | `StoryError`, chain preserved and depth-capped |
| `Date` | ISO string, or `"[Invalid Date]"` |
| `Map` | `{ "@type": "Map", entries: {…} }` |
| `Set` | `{ "@type": "Set", values: […] }` |
| `RegExp`, `URL` | string |
| TypedArray, `Buffer`, `ArrayBuffer` | `{ "@type", byteLength, preview }` |
| class instance | plain object tagged `"@type": ClassName` |
| function | `"[Function: name]"` |
| circular reference | `"[Circular → path]"` |
| throwing getter | `"[Unreadable: message]"` |
| `BigInt`, `Symbol`, `NaN`, `Infinity` | string |
| object with `toJSON()` | the result of calling it |

Values dropped for size become an explicit `{ "@truncated": { kind, omitted } }` marker, so a consumer can tell truncation from absence.

Keys matching `password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`, `sessionId`, `privateKey` and similar are replaced with `"[redacted]"`. Matching ignores case and separators, so `apiKey`, `api_key` and `API-KEY` all match. This is best-effort defense in depth, not a guarantee — it matches key names, not values.

**The function never throws.**

---

## normalizeError(error, options?)

Turn any thrown value into a serializable `StoryError`, following the `cause` chain (capped at 5 levels) and collecting `AggregateError` members.

```ts
normalizeError(rawError: unknown, options?: NormalizeOptions): StoryError
```

Error-shaped plain objects — the kind that arrive across a serialization boundary — are recognized by their `name` and `message` fields.

---

## Custom Audiences

Implement the `AudienceMember` interface to create your own audience.

```ts
type AudienceMember = {
  name: string;
  hears?: EmissionKind[];          // Defaults to ["story"]
  accepts?(emission: Emission): boolean;
  hear(emission: Emission): void | Promise<void>;
};
```

```ts
// Example: Slack webhook audience for errors only
const slackAudience: AudienceMember = {
  name: "slack",
  accepts: (event) => event.level === "Error",
  hear: async (event) => {
    const summary = event.summarize({ colors: false, detail: "brief" });
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      body: JSON.stringify({ text: `${event.title}\n${summary.text}` }),
    });
  },
};

story.audience.add(slackAudience);
```

---

## formatStory(story, options?)

Standalone function to generate a formatted summary from a `StoryEventBase` object. Used internally by `Storyteller.summarize()` and `writeStoryReport()`, but also available directly.

> **Deprecated alias:** `summarizeStory` still works but is deprecated. Use `formatStory` instead.

```ts
formatStory(
  story: StoryEventBase,
  options?: {
    timezone?: string;
    locale?: string;
    detail?: "brief" | "normal" | "full";
    noteLimit?: number;
    showData?: boolean;
    colors?: boolean;
  }
): FormattedReport
```

```ts
import { formatStory } from "@lovelaces-io/storyteller";

// Format a raw story event (e.g., loaded from a database)
const result = formatStory(savedEvent, {
  colors: false,
  detail: "full",
});
console.log(result.text);
```

---

## writeStoryReport(stories, options?)

Generate a formatted report from an array of story events, grouped by day.

```ts
writeStoryReport(
  stories: StoryEventBase[],
  options?: {
    timezone?: string;          // default: local timezone
    locale?: string;            // default: "en-US"
    detail?: "brief" | "normal" | "full";  // default: "normal"
    noteLimit?: number;         // default: 50
    showData?: boolean;         // default: true
    colors?: boolean;           // default: true
  }
): string
```

```ts
import { writeStoryReport } from "@lovelaces-io/storyteller";

// Generate a report from stored events
const report = writeStoryReport(events, {
  timezone: "America/New_York",
  detail: "brief",
  colors: false,
});
console.log(report);
```

Output format:
```
Storyteller Report (America/New_York)
Range: Mar 20, 2026 – Mar 22, 2026

Mar 20, 2026
Story: User signed up
Level: Information
Time: Mar 20, 2026, 3:42:18 PM

Mar 22, 2026
Story: Payment failed
Level: Error
Time: Mar 22, 2026, 10:15:03 AM (1.2s)
Origin: checkout / Payment
Error: gateway timeout
```

---

## formatDuration(ms)

Formats a duration in milliseconds into a human-readable string.

```ts
formatDuration(ms: number): string
```

```ts
import { formatDuration } from "@lovelaces-io/storyteller";

formatDuration(350);    // "350ms"
formatDuration(1200);   // "1.2s"
formatDuration(65000);  // "1m 5s"
```

---

## Types

All types are exported from the main entry point.

### StoryLevel

```ts
type StoryLevel = "Information" | "Warning" | "Error";
```

### StoryContextValue

```ts
type StoryContextValue = Record<string, unknown> | string;
```

Used for `who`, `what`, and `where` fields on notes and origins.

### StoryError

```ts
type StoryError = {
  name?: string;
  message?: string;
  stack?: string;
  cause?: JsonValue;               // Normalized, so the chain survives storage
  errors?: StoryError[];           // AggregateError members
};
```

### StoryNote

```ts
type StoryNote = {
  timestamp: string;             // ISO 8601 timestamp
  sequence?: number;             // Position in the story, gap-free from 0
  note: string;                  // The note text
  level?: StoryLevel;            // Omitted when Information
  who?: StoryContextValue;
  what?: StoryContextValue;
  where?: StoryContextValue;
  error?: StoryError;
};
```

### StoryEventBase

```ts
type StoryEventBase = {
  timestamp: string;
  level: StoryLevel;               // "Information", "Warning", or "Error"
  title: string;
  storyId?: string;                // Correlates beats with their story
  parentStoryId?: string;          // Set on a chapter; absent at top level
  origin?: StoryOrigin;
  notes: StoryNote[];
  error?: StoryError;
  durationMs?: number;             // Computed from first to last note (undefined if < 2 notes)
  droppedEmissions?: number;       // Present only when back-pressure dropped something
};
```

### StoryEvent

Extends `StoryEventBase` with a `summarize()` method. This is what audience members receive.

```ts
type StoryEvent = StoryEventBase & {
  kind: "story";
  summarize: (options?: ReportOptions) => FormattedReport;
};
```

### FormattedReport

> **Deprecated alias:** `StorySummary` still works but is deprecated.

```ts
type FormattedReport = {
  text: string;           // Formatted, human-readable text
  data: StoryReport;      // Structured data
};
```

### StoryReport

> **Deprecated alias:** `StorySummaryData` still works but is deprecated.

```ts
type StoryReport = {
  title: string;
  level: StoryLevel;
  when: string;              // Formatted date/time string
  durationMs?: number;       // Time between first and last note
  duration?: string;         // Human-readable duration (e.g., "1.2s")
  origin?: StoryEventBase["origin"];
  notes: ReportNote[];
  error?: StoryError;
};
```

### ReportOptions

> **Deprecated alias:** `StorySummaryOptions` still works but is deprecated.

```ts
type ReportOptions = {
  timezone?: string;
  locale?: string;
  detail?: "brief" | "normal" | "full";
  noteLimit?: number;
  showData?: boolean;
  colors?: boolean;
};
```

### ReportNote

> **Deprecated alias:** `StorySummaryNote` still works but is deprecated.

A formatted note within a `StoryReport`.

### PreviewOptions

> **Deprecated alias:** `StoryPreviewOptions` still works but is deprecated.

Options passed to `story.summarize()`. Same shape as `ReportOptions`.

### EmissionKind

```ts
type EmissionKind = "note" | "story";
```

---

### NoteEmission

A beat as delivered to an audience.

```ts
type NoteEmission = StoryNote & {
  kind: "note";
  storyId: string;
  sequence: number;
  level: StoryLevel;
  origin?: StoryOrigin;
};
```

---

### Emission

```ts
type Emission = NoteEmission | StoryEvent;
```

---

### Narration

```ts
type Narration = "collected" | "live";
```

`"both"` is accepted as a deprecated alias of `"live"`.

---

### LevelInput

```ts
type LevelInput = StoryLevel | "info" | "information" | "warn" | "warning" | "oops" | "error";
```

---

### JsonValue

```ts
type JsonValue =
  | string | number | boolean | null
  | JsonValue[]
  | { [key: string]: JsonValue };
```

---

### AudienceMember

```ts
type AudienceMember<Kind extends EmissionKind = "story"> = {
  name: string;
  hears?: Kind[];                              // Defaults to ["story"]
  accepts?(emission: EmissionOf<Kind>): boolean;
  hear(emission: EmissionOf<Kind>): void | Promise<void>;
};
```

Typed by what it hears. With no `hears`, `accepts` and `hear` receive a `StoryEvent` — an
audience written before live narration compiles unchanged. `hears: ["note"]` gives a
`NoteEmission`; `["note", "story"]` gives the `Emission` union, and you narrow on `kind`.

---

## Full Example

```ts
import {
  Storyteller,
  dbAudience,
  writeStoryReport,
} from "@lovelaces-io/storyteller";

// Set up a storyteller with origin context and a db audience
const story = new Storyteller({
  origin: { where: { app: "checkout", page: "Payment" } },
  audiences: [
    dbAudience(async (event) => {
      await db.insert("logs", event);
    }),
  ],
});

// Report each beat as the operation progresses
story.report("User submitted payment", {
  who: { id: "user:413" },
  what: { amount: 49.99, currency: "USD" },
});

story.report("Charging card", {
  what: "stripe:charge",
  where: { service: "payments" },
});

// Happy path
story.finish("Payment completed");

// Or if something goes wrong
story.report("Gateway timed out after 5000ms", {
  what: { gateway: "stripe", timeout: 5000 },
  error: new Error("gateway timeout"),
});
story.finish("Payment failed", { level: "oops", error }).to("console", "db");

// Later, generate a report from stored events
const events = await db.query("SELECT * FROM logs WHERE timestamp > ?", [yesterday]);
const report = writeStoryReport(events, {
  colors: false,
  detail: "brief",
});
console.log(report);
```
