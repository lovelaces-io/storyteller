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
  formatDuration,
  getLevelLabel,
} from "@lovelaces-io/storyteller";
```

---

## Storyteller

The core class. Collects notes and emits them as structured story events.

### Constructor

```ts
new Storyteller(options?: {
  origin?: {
    who?: string | Record<string, unknown>;
    what?: string | Record<string, unknown>;
    where?: string | Record<string, unknown>;
  };
  audiences?: AudienceMember[];
})
```

The `origin` is attached to every story emitted by this instance. A `consoleAudience` is registered by default. Additional audiences passed here are added on top.

```ts
const story = new Storyteller({
  origin: {
    where: { app: "checkout", page: "Payment" },
  },
});
```

---

### story.note(text, data?)

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
story.note("User submitted form");

story.note("Validation failed", {
  who: { id: "user:42", role: "admin" },
  what: { field: "email", reason: "invalid format" },
  where: { component: "SignupForm" },
  error: new Error("invalid email"),
});

// Chaining
story
  .note("Step 1")
  .note("Step 2")
  .note("Step 3");
```

---

### story.tell(title)

Emit a story at the `"tell"` level (success / informational).

```ts
tell(title: string): { to: (...audienceNames: string[]) => void }
```

Collects all accumulated notes, emits the story to all audiences, and clears the notes.

```ts
story.note("Page rendered");
story.note("Data loaded");
story.tell("Dashboard ready");
// notes are now cleared for the next story
```

---

### story.warn(title)

Emit a story at the `"warn"` level.

```ts
warn(title: string): { to: (...audienceNames: string[]) => void }
```

```ts
story.note("Response took 4200ms");
story.warn("API response slow");
```

---

### story.oops(title, error?)

Emit a story at the `"oops"` level (error). Optionally attach an error object.

```ts
oops(title: string, error?: unknown): { to: (...audienceNames: string[]) => void }
```

```ts
try {
  await saveProfile(data);
} catch (error) {
  story.note("Write failed", { where: "primary-db", error });
  story.oops("Failed to save profile", error);
}
```

---

### .to(...audienceNames) — Targeting Audiences

`tell()`, `warn()`, and `oops()` all return an object with a `.to()` method. Call it synchronously to deliver the story only to specific audiences instead of all registered ones.

```ts
// Deliver to all audiences (default)
story.tell("Page loaded");

// Deliver only to "console" and "db"
story.oops("Critical failure", error).to("console", "db");

// Deliver only to "db" (skip console)
story.warn("Slow query").to("db");
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
story.note("User opened page");
story.note("Widgets loaded", { what: { count: 6 } });

const summary = story.summarize({
  title: "Dashboard status",
  level: "tell",
  detail: "full",
});

console.log(summary.text);  // Formatted, colorized text block
console.log(summary.data);  // Structured StoryReport object

// Notes are still here — summarize doesn't clear them
story.tell("Dashboard ready");  // This story includes the same notes
```

---

### story.reset()

Clear all accumulated notes without emitting a story.

```ts
reset(): Storyteller
```

```ts
story.note("Starting process");
story.note("Cancelled by user");
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
  accepts: (event) => event.level === "oops",
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

// "tell" events are filtered out — only "warn" and "oops" persist
story.tell("Page loaded");           // NOT sent to db
story.warn("Slow response");         // Sent to db
story.oops("Crash", new Error());    // Sent to db
```

---

## Custom Audiences

Implement the `AudienceMember` interface to create your own audience.

```ts
type AudienceMember = {
  name: string;
  accepts?: (event: StoryEvent) => boolean;
  hear: (event: StoryEvent) => void | Promise<void>;
};
```

```ts
// Example: Slack webhook audience for errors only
const slackAudience: AudienceMember = {
  name: "slack",
  accepts: (event) => event.level === "oops",
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

## getLevelLabel(level)

Returns a human-readable label for a `StoryLevel` value.

```ts
getLevelLabel(level: StoryLevel): string
```

```ts
import { getLevelLabel } from "@lovelaces-io/storyteller";

getLevelLabel("tell");  // "Information"
getLevelLabel("warn");  // "Warning"
getLevelLabel("oops");  // "Error"
```

---

## Types

All types are exported from the main entry point.

### StoryLevel

```ts
type StoryLevel = "tell" | "warn" | "oops";
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
  cause?: unknown;
};
```

### StoryNote

```ts
type StoryNote = {
  timestamp: string;             // ISO 8601 timestamp
  note: string;                  // The note text
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
  level: StoryLevel;
  levelLabel: string;              // Human-readable label: "Information", "Warning", or "Error"
  title: string;
  origin?: {
    who?: StoryContextValue;
    what?: StoryContextValue;
    where?: StoryContextValue;
  };
  notes: StoryNote[];
  error?: StoryError;
  durationMs?: number;             // Computed from first to last note (undefined if < 2 notes)
};
```

### StoryEvent

Extends `StoryEventBase` with a `summarize()` method. This is what audience members receive.

```ts
type StoryEvent = StoryEventBase & {
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

### AudienceMember

```ts
type AudienceMember = {
  name: string;
  accepts?: (event: StoryEvent) => boolean;
  hear: (event: StoryEvent) => void | Promise<void>;
};
```

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

// Collect notes as the operation progresses
story.note("User submitted payment", {
  who: { id: "user:413" },
  what: { amount: 49.99, currency: "USD" },
});

story.note("Charging card", {
  what: "stripe:charge",
  where: { service: "payments" },
});

// Happy path
story.tell("Payment completed");

// Or if something goes wrong
story.note("Gateway timed out after 5000ms", {
  what: { gateway: "stripe", timeout: 5000 },
  error: new Error("gateway timeout"),
});
story.oops("Payment failed", new Error("gateway timeout")).to("console", "db");

// Later, generate a report from stored events
const events = await db.query("SELECT * FROM logs WHERE timestamp > ?", [yesterday]);
const report = writeStoryReport(events, {
  colors: false,
  detail: "brief",
});
console.log(report);
```
