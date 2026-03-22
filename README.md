# Storyteller

Lightweight TypeScript logging library that treats logs as **stories** — grouped notes emitted as a single structured event.

Zero dependencies. ~24 kB packed. TypeScript-first.

## Install

```sh
npm install @lovelaces-io/storyteller
```

## Usage

```ts
import { Storyteller } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { where: { app: "checkout", page: "Payment" } },
});

// Collect notes as things happen
story.note("User submitted payment", {
  who: { id: "user:413" },
  what: { amount: 49.99, currency: "USD" },
});

story.note("Charging card", {
  what: "stripe:charge",
  where: { service: "payments" },
});

// Tell the story when it's done
story.tell("Payment completed");
```

Notes are bundled into one structured event, delivered to your audiences, and cleared for the next story.

## Three Levels

```ts
story.tell("Payment completed");              // success
story.warn("Payment slow but succeeded");     // something was off
story.oops("Payment failed", new Error());    // something broke
```

## Context on Every Note

Every note can carry `who`, `what`, `where`, and `error`:

```ts
story.note("Write failed", {
  who: { id: "user:99" },
  what: { field: "email" },
  where: "primary-db",
  error: new Error("db timeout"),
});
```

## Audiences

Stories are delivered to **audiences**. Console is included by default. Add your own:

```ts
import { dbAudience } from "@lovelaces-io/storyteller";

// Persist warn and oops events to your database
story.audience.add(
  dbAudience(async (event) => await db.insert("logs", event))
);

// Target specific audiences per story
story.oops("Critical failure", error).to("console", "db");
```

## Summaries

Generate a formatted summary without emitting:

```ts
const summary = story.summarize({
  title: "Dashboard status",
  level: "tell",
  verbosity: "full",
});

console.log(summary.text);
```

```
Story: Dashboard status
Level: tell
Time: Mar 22, 2026, 3:42:18 PM (12ms)
Origin: checkout / Payment
Notes:
  3:42:18 PM — User submitted payment
  3:42:18 PM — Charging card
```

## Shared Instance

Use `useStoryteller()` for cross-component logging into the same story:

```ts
import { useStoryteller } from "@lovelaces-io/storyteller";

// Same instance everywhere
const story = useStoryteller({ origin: { where: { app: "admin" } } });
```

## Structured Output

Every story is a typed, serializable JSON object — designed for humans and machines:

```json
{
  "timestamp": "2026-03-22T14:15:03.421Z",
  "level": "oops",
  "title": "Payment failed",
  "origin": { "where": { "app": "checkout", "page": "Payment" } },
  "notes": [
    {
      "timestamp": "2026-03-22T14:15:02.218Z",
      "note": "User submitted payment",
      "who": { "id": "user:413" }
    }
  ],
  "error": { "name": "Error", "message": "gateway timeout" }
}
```

## Docs

- [API Reference](docs/API.md) — full signatures and examples
- [How It Works](docs/HOW-IT-WORKS.md) — narrative guide with real-world scenarios
- [Changelog](CHANGELOG.md)

## License

MIT
