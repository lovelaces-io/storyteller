# Storyteller — Agent Guide

## Overview

Storyteller (`@lovelaces-io/storyteller`) is a lightweight TypeScript logging library with zero production dependencies. It treats logs as stories: you collect timestamped notes during an operation, then emit them as a single structured event at one of three levels — `tell` (info), `warn` (warning), or `oops` (error). Events are delivered to pluggable audiences.

Version: 0.1.0 (pre-1.0, API may change). Dual output: ESM + CJS.

## How to use it correctly

### Always create with an origin

Every Storyteller instance should have an origin that identifies where logs come from:

```typescript
const story = new Storyteller({
  origin: { who: "payment-service", what: "checkout" },
});
```

### Collect notes, then emit

The pattern is: accumulate notes during an operation, then emit once with `tell()`, `warn()`, or `oops()`. Notes are cleared after emission.

```typescript
story.note("Validated cart items");
story.note("Applied discount code", { what: "SAVE20" });
story.note("Charged payment method");
story.tell("Checkout completed");
```

### Use .to() for audience targeting

Call `.to()` synchronously and immediately after `tell()`, `warn()`, or `oops()` to target specific audiences. Delivery is microtask-scheduled, so `.to()` must be called in the same synchronous block — not after an `await` or in a callback.

```typescript
story.warn("Payment retry needed").to("db");
story.tell("Health check passed").to("console");
```

### Error handling with oops

Pass the caught error as the second argument to `oops()`. Storyteller normalizes it into a serializable object automatically.

```typescript
try {
  await processPayment();
  story.tell("Payment processed");
} catch (error) {
  story.oops("Payment failed", error);
}
```

## Two output modes

### Story (JSON record)

The `StoryEvent` object is a clean JSON-serializable structure. `JSON.stringify(event)` gives you a DB row. This is what `dbAudience` stores.

### Report (formatted text)

`formatStory()` and `writeStoryReport()` produce colorized, human-readable text for console or file output. This is what `consoleAudience` prints.

Keep these concerns separate. Storage audiences should receive the raw event. Presentation audiences should use the formatting utilities.

## Architecture

```
src/
  storyteller.ts       — core Storyteller class, types, event building, delivery
  formatting.ts        — formatStory(), presentation logic
  useStoryteller.ts    — singleton pattern (useStoryteller)
  utils.ts             — shared utilities: ANSI codes, getLevelColor, formatOrigin
  audiences/
    consoleAudience.ts — prints color-coded grouped output to console
    dbAudience.ts      — persists warn/oops events via insert callback
  report/
    writeStoryReport.ts — multi-story report formatter, grouped by day
  index.ts             — public API barrel export
```

All types are defined in `storyteller.ts`. Formatting utilities live in `utils.ts` — do not duplicate them elsewhere.

## Code standards

This repo follows Lovelaces shared coding standards:

- **Descriptive names** — no abbreviations. Use `options` not `opts`, `error` not `err`, `timestamp` not `ts`.
- **No single-letter variables** — names should read like plain English.
- **JSDoc on every public export** — brief comment explaining the function's purpose.
- **No `as any` casts** — use proper type narrowing.
- **Comments explain why, not what.**
- **Zero production dependencies** — this is a hard constraint.

## Common patterns

### Creating a storyteller

```typescript
import { Storyteller } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { who: "api-server", what: "request-handler" },
});
```

### Adding audiences

```typescript
import { dbAudience } from "@lovelaces-io/storyteller";

story.audience.add(
  dbAudience(async (event) => {
    await db.insert("logs", event);
  })
);
```

The console audience is registered by default. Remove it explicitly if unwanted:

```typescript
story.audience.remove("console");
```

### Singleton usage

```typescript
import { useStoryteller } from "@lovelaces-io/storyteller";

const story = useStoryteller({ origin: { who: "worker" } });
```

### Error handling pattern

```typescript
const story = new Storyteller({ origin: { who: "sync-job" } });

story.note("Starting sync");
try {
  const records = await fetchRecords();
  story.note(`Fetched ${records.length} records`);
  await writeRecords(records);
  story.note("Write complete");
  story.tell("Sync finished");
} catch (error) {
  story.oops("Sync failed", error);
}
```

## Anti-patterns

### Do not store the .to() return value

The object returned by `tell()`, `warn()`, and `oops()` is a one-shot delivery handle. Do not store it or call `.to()` later — delivery happens on the next microtask.

```typescript
// Wrong — delivery may have already happened
const handle = story.tell("Done");
await someAsyncWork();
handle.to("db");

// Correct — call .to() immediately and synchronously
story.tell("Done").to("db");
```

### Do not mix presentation with storage

Audiences that store events (like `dbAudience`) should receive the raw `StoryEvent` object. Do not format or summarize before storing. Formatting is for human-facing output only.

```typescript
// Wrong — storing formatted text in the database
dbAudience(async (event) => {
  await db.insert("logs", { text: event.summarize().text });
});

// Correct — store the raw event, format when reading
dbAudience(async (event) => {
  await db.insert("logs", event);
});
```

### Do not call note() after tell/warn/oops

Emitting a story clears all accumulated notes. Notes added after emission belong to the next story. If you need notes in a specific story, add them before emitting.

### Do not create multiple Storyteller instances for the same logical component

Use `useStoryteller()` for shared/singleton access, or pass a single instance through your call chain. Multiple instances fragment your story across disconnected events.
