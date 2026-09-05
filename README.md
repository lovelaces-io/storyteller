<p align="left"><img src="site/public/storyteller-logo.svg" alt="" width="56" height="56" /></p>

# Storyteller

[![npm](https://img.shields.io/npm/v/@lovelaces-io/storyteller)](https://www.npmjs.com/package/@lovelaces-io/storyteller)
[![license](https://img.shields.io/npm/l/@lovelaces-io/storyteller)](LICENSE)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

Lightweight TypeScript logging library that treats logs as **stories** — beats reported as they happen, emitted as a single structured record.

Zero dependencies. TypeScript-first. One record per story — and a live stream when you want to watch it happen.

## Why Storyteller?

**Before:** 47 scattered `console.log` lines. Something broke. Good luck figuring out what happened.

```
[14:30:00] User clicked checkout
[14:30:00] Validating cart...
[14:30:01] Cart valid
[14:30:01] Charging card...
[14:30:03] ERROR: gateway timeout
[14:30:03] Retrying...
[14:30:04] Charge succeeded
```

**After:** One story. One record. The whole picture.

```json
{
  "level": "Warning",
  "title": "Payment retry succeeded",
  "durationMs": 4000,
  "notes": [
    { "timestamp": "14:30:00", "note": "User clicked checkout" },
    { "timestamp": "14:30:01", "note": "Cart validated", "what": { "items": 3 } },
    { "timestamp": "14:30:03", "note": "Card declined", "error": { "message": "gateway timeout" } },
    { "timestamp": "14:30:04", "note": "Retry succeeded" }
  ]
}
```

## Install

```sh
npm install @lovelaces-io/storyteller
```

## Quick Start

```ts
import { Storyteller } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { who: "checkout-service", where: { app: "web" } },
});

story.report("User submitted payment", { what: { amount: 49.99 } });
story.report("Charging card", { where: "stripe" });
story.finish("Payment completed");
```

Beats are collected, sorted chronologically, and emitted as one structured record to your audiences.

## Watch It Happen

Set narration to `live` and each beat is emitted the moment you report it — the record still lands at the end.

```ts
const story = new Storyteller({
  origin: { who: "sync-agent" },
  narration: "live",
});

story.report("Fetching invoices", { what: { source: "stripe" } });
story.report("Rate limited, backing off", { level: "warn" });
story.finish("Sync complete");
```

```
05:36:50  info  sync-agent  Fetching invoices  {source=stripe}
05:36:50  warn  sync-agent  Rate limited, backing off
```

Or leave the code alone and set `STORYTELLER_NARRATION=live`.

Every beat carries `storyId` and a gap-free `sequence`, so a consumer holding the stream can reassemble exactly the record collected narration would have produced. Nothing is lost either way.

## Feed It Anything

`report()` takes any value. No pre-flattening, no defensive stringifying.

```ts
story.report(await response.json());
story.report(caughtError);              // cause chain preserved
story.report(new Map([["region", "us-east"]]));
story.report({ message: "Job queued", jobId: 7 });
```

Circular references become `[Circular → path]`. Secret-looking keys become `[redacted]`. Oversized values get an explicit `{ "@truncated": … }` marker rather than disappearing. The normalizer never throws — a hostile object cannot break your logging.

## Nested Work

Real work nests. `chapter()` gives you a child storyteller whose stories link back to the parent:

```ts
story.report("Starting sync");

for (const account of accounts) {
  const chapter = story.chapter({ origin: { what: account.id } });
  chapter.report("Fetching invoices");
  chapter.finish(`Synced ${account.id}`);
}

story.finish("Sync complete");
```

Each chapter is a complete record of its own, carrying `parentStoryId`. Follow that field to rebuild the whole run as a tree. Chapters share the parent's audiences and inherit its settings.

## Teach Your Agents

Run `npx @lovelaces-io/storyteller init` to set up a project in one command — it installs the package, writes a configured storyteller, and adds the block below to your `AGENTS.md`.

Or paste it yourself. Every agent that works in the repo will read it:

<details>
<summary>Agent guidance block</summary>

## Logging with Storyteller

This project uses [Storyteller](https://github.com/lovelaces-io/storyteller). Narrate multi-step work as you do it, then finish once.

```ts
import { useStoryteller } from "@lovelaces-io/storyteller";

const story = useStoryteller({ origin: { who: "sync-job" } });

story.report("Fetching invoices", { what: { source: "stripe" } });
story.report("Rate limited, backing off", { level: "warn" });
story.report(await response.json());

story.finish("Sync complete");
// on failure: story.finish("Sync failed", { level: "oops", error });
```

For nested work, open a chapter. Each becomes its own record, linked to the parent:

```ts
for (const account of accounts) {
  const chapter = story.chapter({ origin: { what: account.id } });
  chapter.report("Reconciling");
  chapter.finish(`Synced ${account.id}`);
}
```

Things that are easy to get wrong:

- **Hand it the object.** `report()` takes any value — errors, API responses, Maps, class instances — and structures it safely, including circular references. Never `JSON.stringify` first.
- **One storyteller per logical operation**, not one per step. Separate instances fragment the work into disconnected stories.
- **Order beats by `sequence`, not arrival time.** Audiences are async and a slow one lands late.
- **`.to()` is synchronous.** Call it immediately after `finish()`, never after an `await`.
- **Report before finishing.** `finish()` clears the notes; anything reported after belongs to the next story.

Set `STORYTELLER_NARRATION=live` to watch beats stream as they happen, or `STORYTELLER_FORMAT=ndjson` for one JSON object per line.

</details>

## Two Axes, Not One

**Story vs report** is *what the output looks like*. **Collected vs live** is *when it comes out*. They combine freely:

|  | Collected | Live |
|---|---|---|
| **Story** (JSON) | one record at the end | beats stream as JSON, record still lands |
| **Report** (text) | one grouped block at the end | one compact line per beat |

`JSON.stringify(event)` gives you the story record — a complete DB row, no assembly. `formatStory(event)` gives you the report.

## Levels

```ts
story.finish("Payment completed");                              // all good
story.finish("Payment slow but succeeded", { level: "warn" });  // heads up
story.finish("Payment failed", { level: "oops", error });       // something broke
```

Levels work on individual beats too: `story.report("Retrying", { level: "warn" })`.

`level` accepts `"info"`, `"warn"`, `"oops"`, `"error"`, or the stored labels.

## Context on Every Beat

```ts
story.report("Write failed", {
  who: { id: "user:99" },
  what: { field: "quantity" },
  where: "primary-db",
  error: new Error("db timeout"),
});
```

## Audiences — Who Hears Your Stories

Stories are delivered to **audiences**. Console is included by default.

```ts
import { dbAudience, ndjsonAudience } from "@lovelaces-io/storyteller";

// Store warn and oops records in your database
story.audience.add(
  dbAudience(async (event) => await db.insert("logs", event))
);

// One JSON object per line, for a program to read
story.audience.add(ndjsonAudience({ stream: process.stderr }));

// Target specific audiences
story.finish("Critical failure", { level: "oops", error }).to("console", "db");
```

An audience declares which emission kinds it wants. `hears` defaults to `["story"]`, so audiences written before live narration keep working unchanged.

```ts
story.audience.add({
  name: "metrics",
  hears: ["note"],
  hear: (emission) => send(emission),
});
```

Audiences are small. Only the failures, straight to a Discord channel — fifteen lines, no dependency:

```ts
story.audience.add({
  name: "discord",
  accepts: (event) => event.level === "Error",
  hear: async (event) => {
    await fetch(process.env.DISCORD_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "```\n" + event.summarize({ colors: false, detail: "brief" }).text + "\n```",
      }),
    });
  },
});
```

When an audience throws, the failure is reported rather than swallowed, and never reaches your code. When one is too slow, emissions past `maxInFlight` are dropped and counted in `droppedEmissions` on the closing record — visible loss beats silent loss.

## Keep Them, Ask Them

A story is the unit of retrieval: complete, ordered, small enough for a context window. Keep them in a store and the question *why did last night's sync fail?* has somewhere to look.

```ts
import { stories, storeAudience } from "@lovelaces-io/storyteller";
import { fileStore } from "@lovelaces-io/storyteller/store/file";

const kept = fileStore("./stories.jsonl");   // or memoryStore() anywhere
story.audience.add(storeAudience(kept));

await stories(kept).failing().since("1h");
await stories(kept).about("checkout").from("payment-service").level("oops").since("24h");
await stories(kept).slowerThan("5s").since("7d").oldest().limit(10);
```

Ask in words; every store answers the same question. Then let an agent ask: **the Librarian** is a read-only MCP server over any store.

```jsonc
// .mcp.json
{ "mcpServers": { "storyteller": { "command": "npx", "args": ["-y", "@lovelaces-io/storyteller-mcp", "./stories.jsonl"] } } }
```

Redaction runs at capture and again at the storage boundary — secret-named keys and recognisable secret formats inside any string — so what is kept is what is safe to keep. Defense in depth, not a guarantee; [SECURITY.md](./SECURITY.md) says exactly what it does not promise.


## Configuration

Every option can also come from the environment, so you can change behavior without touching code:

| Variable | Values | Effect |
|---|---|---|
| `STORYTELLER_NARRATION` | `collected` \| `live` | Whether beats stream |
| `STORYTELLER_FORMAT` | `text` \| `ndjson` | Which default audience is registered |
| `STORYTELLER_LEVEL` | `info` \| `warn` \| `oops` | Minimum level delivered |
| `STORYTELLER_COLOR` | `0` \| `1` | Force colors off or on |

## Quick Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `report(input, context?)` | `this` | Report a beat — any value, optional who/what/where/error/level |
| `finish(title, options?)` | `{ to }` | Emit the collected story |
| `narrate(mode)` | `this` | Switch narration at runtime |
| `chapter(options?)` | `Storyteller` | A child storyteller, linked by `parentStoryId` |
| `reset()` | `this` | Clear beats without emitting |
| `summarize(options?)` | `FormattedReport` | Preview current beats as a formatted report |
| `currentStoryId` | `string` | The id beats are being tagged with |
| `audience.add(member)` | `this` | Register an audience |
| `audience.remove(name)` | `this` | Unregister an audience |
| `audience.has(name)` | `boolean` | Check if an audience is listening |
| `audience.names()` | `string[]` | List who's listening |

### Deprecated — removed at 1.0

| Old | New |
|---|---|
| `note(text, context?)` | `report(input, context?)` |
| `tell(title)` | `finish(title)` |
| `warn(title)` | `finish(title, { level: "warn" })` |
| `oops(title, error?)` | `finish(title, { level: "oops", error })` |

The aliases behave identically and stay silent unless you set `STORYTELLER_DEPRECATION_WARNINGS=1`. `tell` will not be reintroduced with a new meaning.

## Shared Instance

```ts
import { useStoryteller } from "@lovelaces-io/storyteller";

const story = useStoryteller({ origin: { who: "worker" } });
```

## Docs

- [API Reference](docs/API.md) — full signatures and examples
- [How It Works](docs/HOW-IT-WORKS.md) — narrative guide
- [Changelog](CHANGELOG.md)
- [For AI Agents](packages/core/AGENTS.md) — the guide that ships in the package, for AI coding assistants
- [The Library](https://storyteller.lovelaces.io/docs/library) — keep stories, ask in words, let an agent read them back
- [The Librarian](packages/mcp/README.md) — `@lovelaces-io/storyteller-mcp`, the read-only MCP server

## License

MIT
