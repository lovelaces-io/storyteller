# Storyteller

[![npm](https://img.shields.io/npm/v/@lovelaces-io/storyteller)](https://www.npmjs.com/package/@lovelaces-io/storyteller)
[![license](https://img.shields.io/npm/l/@lovelaces-io/storyteller)](LICENSE)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

Lightweight TypeScript logging library that treats logs as **stories** — grouped notes emitted as a single structured event.

Zero dependencies. TypeScript-first. One record per story.

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
  "level": "warn",
  "title": "Payment retry succeeded",
  "durationMs": 4000,
  "notes": [
    { "note": "User clicked checkout" },
    { "note": "Cart validated", "what": { "items": 3 } },
    { "note": "Card declined", "error": { "message": "gateway timeout" } },
    { "note": "Retry succeeded" }
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

story.note("User submitted payment", { what: { amount: 49.99 } });
story.note("Charging card", { where: "stripe" });
story.tell("Payment completed");
```

Notes are collected, sorted chronologically, and emitted as one structured event to your audiences.

## Two Output Modes

| Mode | What it is | Use it for |
|------|-----------|------------|
| **Story** (JSON) | Clean serializable record | DB storage, monitoring, audit logs |
| **Report** (text) | Colorized human-readable output | Console, log files, debugging |

`JSON.stringify(event)` gives you the story record. `formatStory(event)` gives you the report.

## Three Levels

```ts
story.tell("Payment completed");              // all good
story.warn("Payment slow but succeeded");     // heads up
story.oops("Payment failed", new Error());    // something broke
```

## Context on Every Note

```ts
story.note("Write failed", {
  who: { id: "user:99" },
  what: { field: "email" },
  where: "primary-db",
  error: new Error("db timeout"),
});
```

## Audiences — Who Hears Your Stories

Stories are delivered to **audiences**. Console is included by default.

```ts
import { dbAudience } from "@lovelaces-io/storyteller";

// Store warn and oops events in your database
story.audience.add(
  dbAudience(async (event) => await db.insert("logs", event))
);

// Target specific audiences
story.oops("Critical failure", error).to("console", "db");
```

## Quick Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `note(text, context?)` | `this` | Add a timestamped note with optional who/what/where/error |
| `tell(title)` | `{ to }` | Emit a success story |
| `warn(title)` | `{ to }` | Emit a warning story |
| `oops(title, error?)` | `{ to }` | Emit an error story |
| `reset()` | `this` | Clear notes without emitting |
| `summarize(options?)` | `FormattedReport` | Preview current notes as a report |
| `audience.add(member)` | `this` | Register an audience |
| `audience.remove(name)` | `this` | Unregister an audience |
| `audience.has(name)` | `boolean` | Check if audience exists |
| `audience.names()` | `string[]` | List registered audiences |

## Shared Instance

```ts
import { useStoryteller } from "@lovelaces-io/storyteller";

const story = useStoryteller({ origin: { who: "worker" } });
```

## Docs

- [API Reference](docs/API.md) — full signatures and examples
- [How It Works](docs/HOW-IT-WORKS.md) — narrative guide
- [Changelog](CHANGELOG.md)
- [For AI Agents](AGENTS.md) — guidance for AI coding assistants

## License

MIT
