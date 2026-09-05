# Storyteller — Agent Guide

## Overview

Storyteller (`@lovelaces-io/storyteller`) is a lightweight TypeScript logging library with zero production dependencies. You report beats of work as they happen; it keeps them and emits them as one structured record when the work finishes. Records go to pluggable audiences.

Version: 0.4.0 (pre-1.0, API may change). Dual output: ESM + CJS.

## Narrate your work

If you are an agent doing a multi-step task, this is the pattern. Report each step as you take it, then finish once:

```typescript
import { Storyteller } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { who: "sync-agent", where: { service: "billing" } },
  narration: "live",
});

story.report("Reading config");
story.report("Fetching invoices", { what: { source: "stripe", page: 1 } });
story.report("Rate limited, backing off", { level: "warn" });
story.report("Retry succeeded", { what: { attempt: 2 } });

story.finish("Sync complete");
```

In `live` narration each `report()` is emitted the moment you call it, so whoever is watching sees the work in progress. The full record still lands at `finish()`. Nothing is lost either way.

## Choosing a narration mode

| You want | Use |
|---|---|
| One record per operation, for storage or audit | `collected` (the default) |
| Progress visible while the work runs | `live` |
| To decide without touching the code | leave it unset, set `STORYTELLER_NARRATION=live` |

`live` never removes an emission — it adds the beats and still delivers the story. A consumer that wants only beats says so with `hears: ["note"]`, rather than silencing the record.

Switch at runtime with `story.narrate("live")`, or push a single urgent beat out of an otherwise collected story with `story.report("...", { live: true })`.

## Streaming loses nothing

Every beat carries `storyId` and `sequence`. Beats from one story share its `storyId`, and `sequence` is gap-free from 0, assigned at the moment you call `report()`.

That means a consumer holding the streamed beats can order and group them back into exactly the `notes` array the story record would have contained. **Order by `sequence`, never by arrival time** — audiences are async and a slow one lands late.

## Nested work: chapters

Real work nests. An agent spawns subtasks; a batch runs per-item operations. Use `chapter()` so each piece is a complete story in its own right while the whole run stays reconstructable:

```typescript
story.report("Starting sync");

for (const account of accounts) {
  const chapter = story.chapter({ origin: { what: account.id } });
  chapter.report("Fetching invoices");
  chapter.report("Reconciling");
  chapter.finish(`Synced ${account.id}`);
}

story.finish("Sync complete");
```

Each chapter emits its own record carrying `parentStoryId`. Follow that field to rebuild the tree. A chapter shares the parent's audiences — including any added later — and inherits narration, level and delivery settings; pass options to override.

Chapters are **not** folded into the parent's notes. One record per story stays true, and a nested story is still a story.

## Report anything

`report()` takes any value, not just a string. Do not pre-flatten your data:

```typescript
story.report(await response.json());
story.report(caughtError);
story.report(new Map([["region", "us-east"]]));
story.report({ message: "Job queued", jobId: 7 });   // "message" becomes the note text
```

Whatever you pass is normalized into something storable: errors keep their `cause` chain, dates become ISO strings, class instances get an `@type` tag, circular references become `[Circular → path]`, and secret-looking keys (`password`, `apiKey`, `token`, …) become `[redacted]`.

Values dropped for size are replaced with an explicit `{ "@truncated": { kind, omitted } }` marker, so you can tell "this was empty" from "this was too big".

The normalizer never throws. A hostile object cannot break the pipeline.

## Secrets

Redaction happens at capture and again at the storage boundary: values under secret-named keys (`password`, `apiKey`, `dbPassword`, `x-api-key`), and recognisable secret formats inside any string (Stripe/OpenAI/GitHub keys, JWTs, PEM blocks, `Bearer …`, passwords in URLs, `?token=`), become `[redacted]` — error messages and stacks included. It is defense in depth, not a guarantee: a secret that looks like a word passes. Do not report a secret and rely on redaction; do not turn `redact` off in code that persists. `auditRedaction(value)` shows what would be removed, so check a real corpus before trusting coverage. `redactValues: "strict"` trades some legitimate content for more coverage.

## Output a program can read

For machine consumption, use NDJSON — one JSON object per line, nothing else on the channel:

```typescript
import { ndjsonAudience } from "@lovelaces-io/storyteller";

story.audience.remove("console");
story.audience.add(ndjsonAudience({ stream: process.stderr }));
```

Or set `STORYTELLER_FORMAT=ndjson` and change no code at all.

## Environment variables

| Variable | Values | Effect |
|---|---|---|
| `STORYTELLER_NARRATION` | `collected` \| `live` | Whether beats stream |
| `STORYTELLER_FORMAT` | `text` \| `ndjson` | Which default audience is registered |
| `STORYTELLER_LEVEL` | `info` \| `warn` \| `oops` | Minimum level delivered |
| `STORYTELLER_COLOR` | `0` \| `1` | Force colors off or on |
| `STORYTELLER_DEPRECATION_WARNINGS` | `1` | Warn when deprecated methods are called |

Unrecognized values fall back to the default rather than throwing.

## Error handling

Pass the caught value to `finish()`. It is normalized automatically:

```typescript
const story = new Storyteller({ origin: { who: "sync-job" } });

story.report("Starting sync");
try {
  const records = await getRecords();
  story.report("Retrieved records", { what: { count: records.length } });
  await writeRecords(records);
  story.finish("Sync finished");
} catch (error) {
  story.finish("Sync failed", { level: "oops", error });
}
```

## Two output modes, two narration modes

These are different axes and it matters that you keep them straight:

|  | Collected | Live |
|---|---|---|
| **Story** (JSON record) | one record at the end | beats stream as JSON, record still lands |
| **Report** (formatted text) | one grouped block at the end | one compact line per beat |

*Story* vs *report* is **what the output looks like**. *Collected* vs *live* is **when it comes out**.

`JSON.stringify(event)` gives you the story record — a complete DB row, no assembly required. `formatStory(event)` gives you the human-readable report.

## API

```typescript
story.report(input, context?)   // a beat; returns `this` for chaining
story.finish(title, options?)   // emit the collected story; returns a `.to()` handle
story.narrate(mode)             // switch narration at runtime
story.chapter(options?)         // a child storyteller, linked by parentStoryId
story.reset()                   // drop the notes, start a new story id
story.summarize(options?)       // preview without emitting
story.currentStoryId            // the id beats are being tagged with
story.audience.add/remove/has/names
```

`context`: `{ who, what, where, error, level, live, to }`
`options`: `{ level, error }`
`level` accepts `"info"`, `"warn"`, `"oops"`, `"error"`, or the stored labels.

### Deprecated — removed at 1.0

| Old | New |
|---|---|
| `note(text, context?)` | `report(input, context?)` |
| `tell(title)` | `finish(title)` |
| `warn(title)` | `finish(title, { level: "warn" })` |
| `oops(title, error?)` | `finish(title, { level: "oops", error })` |

The aliases behave identically. `tell` will not be reintroduced with a new meaning.

## Audiences

An audience declares which emission kinds it wants. **`hears` defaults to `["story"]`**, so an audience written before live narration existed keeps hearing only stories:

```typescript
story.audience.add({
  name: "metrics",
  hears: ["note"],                      // beats only
  accepts: (emission) => emission.level !== "Information",
  hear: (emission) => send(emission),
});
```

Built in: `consoleAudience()` (notes and stories, registered by default), `dbAudience(insert)` (stories only, warn and oops), `ndjsonAudience(options)` (notes and stories).

When an audience throws, the failure is reported through `onAudienceError` rather than swallowed, and never propagates into your code. When an audience is too slow, emissions past `maxInFlight` are dropped and counted in `droppedEmissions` on the closing story — so the loss shows up in the record instead of vanishing.

## Keeping stories, and reading them back

A story is the unit of retrieval: complete, ordered, small enough for a context window. A `StoryStore` keeps them and answers structured questions; `storeAudience` is the one-line bridge from delivery.

```typescript
import { memoryStore, stories, storeAudience } from "@lovelaces-io/storyteller";
import { fileStore } from "@lovelaces-io/storyteller/store/file";   // Node only

const kept = fileStore("./stories.jsonl");         // or memoryStore() for a browser, a test, one run
story.audience.add(storeAudience(kept));

await stories(kept).about("checkout").failing().since("24h");   // reads like the question
await stories(kept).slowerThan("5s").since("7d").oldest().limit(10);
await stories(kept).under(storyId);                                // its chapters
await kept.prune(new Date(Date.now() - 30 * 86_400_000));
```

`stories(store)` is the vocabulary: `about`, `from`, `level`, `atLeast`, `failing`, `succeeding`, `slowerThan`, `since`, `until`, `under`, `newest`, `oldest`, `limit`, `skip`; then `all()`, `first()` or `count()`, or just `await` it. It compiles to a `StoryQuery` object, never a string. `about` searches title, note text, scalar context and error messages; `from` searches the origin. To write an adapter for a database, store `canonicalRow(story)` and make its query agree with `matchesQuery` — that agreement is the contract.

## Rendering stories for humans

Stories are JSON so programs can read them. When a person needs to read one — an admin log screen, a terminal, a chat transcript — use `@lovelaces-io/storyteller-view`, a separate zero-dependency package from the same repo:

```ts
import { renderStory, renderStoryText } from "@lovelaces-io/storyteller-view";

renderStory(event);            // HTMLElement: timeline of notes, context trees, error with cause chain
renderStoryText(event, { colors: true }); // string: the same layout as indented text
```

Both accept a `StoryEvent`, a `NoteEmission`, or a stored record read back from a database or NDJSON. Every marker the normalizer leaves (`@type`, `@truncated`, `[Circular → path]`, `[redacted]`) is shown as what it means rather than as a string, and the DOM renderer inserts text nodes only — never `innerHTML` — because story content is user input. Do not hand-roll a story renderer in an app; reach for the view and theme it with the `--stv-*` custom properties.

## Architecture

```
packages/core/
src/
  storyteller.ts       — core class, types, event building, delivery
  normalize.ts         — turns any value into something storable
  environment.ts       — env-var config, level resolution
  formatting.ts        — formatStory(), presentation logic
  useStoryteller.ts    — singleton pattern
  utils.ts             — ANSI codes, getLevelColor, formatOrigin, summarizeContext
  audiences/
    consoleAudience.ts — compact line per beat, grouped block per story
    dbAudience.ts      — persists warn/oops stories via insert callback
    ndjsonAudience.ts  — one JSON object per line
  report/
    writeStoryReport.ts — multi-story report, grouped by day
  cli.ts               — `storyteller init`, CommonJS-only so __dirname resolves
  index.ts             — public API barrel export
snippets/
  agents-section.md    — the guidance block consumers paste into their AGENTS.md
```

The repository is a workspace: this package is `packages/core`; add-on packages with
real dependencies (a SQLite store, an MCP server) live beside it under `packages/`
and are never imported by core.

`snippets/agents-section.md` is the single source for that block. It is embedded
verbatim in README.md and written by `storyteller init`, and `npm run check:snippet`
fails the build if the copies drift or it outgrows its 40-line budget. Edit the
snippet, never a copy.

Types are defined in `storyteller.ts` and `normalize.ts`. Formatting utilities live in `utils.ts` — do not duplicate them elsewhere.

## Code standards

This repo follows [Lovelaces](https://lovelaces.io) coding standards:

- **Descriptive names** — no abbreviations. `options` not `opts`, `error` not `err`, `timestamp` not `ts`.
- **No single-letter variables.**
- **JSDoc on every public export.**
- **No `as any` casts** — use proper type narrowing.
- **Comments explain why, not what.**
- **Zero production dependencies** — a hard constraint.

## Anti-patterns

### Do not order streamed beats by arrival time

Audiences are async. Two beats can land out of order. `sequence` is assigned synchronously and is the only correct ordering key.

### Do not pre-stringify your data

`report()` normalizes anything you give it. `JSON.stringify`-ing first loses structure and can throw on a circular reference before Storyteller ever sees it.

### Do not store the .to() return value

The object returned by `finish()` is a one-shot delivery handle. Delivery happens on the next microtask, so `.to()` must be called immediately and synchronously — not after an `await`.

```typescript
// Wrong — delivery may have already happened
const handle = story.finish("Done");
await someAsyncWork();
handle.to("db");

// Correct
story.finish("Done").to("db");
```

### Do not mix presentation with storage

Storage audiences should receive the raw emission. Do not format before storing — format when reading.

### Do not create a Storyteller per step

One instance per logical operation. Multiple instances fragment your work across disconnected stories with different `storyId`s. Use `useStoryteller()` for shared access, or pass one instance through the call chain.

### Do not report after finishing

`finish()` clears the notes and starts a new story id. Beats reported afterwards belong to the next story.
