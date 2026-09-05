# Storyteller

### Your logs should tell a story — not just scream into the void.

---

## The Problem

You know this log output:

```
[INFO] User clicked submit
[INFO] Validating form
[ERROR] DB write failed
[ERROR] Connection timeout
[INFO] Retrying...
[WARN] Retry succeeded with fallback
```

Six lines. No connection between them. No context about *who* did *what* or *where* it happened. When you're debugging at 2am, you're left piecing together a mystery novel from scattered sticky notes.

**What if your logs could tell the whole story?**

---

## The Idea

Storyteller treats a sequence of events as a single **story** — not a pile of disconnected lines. You report each beat as it happens, and when the work is done you finish — one record, the whole story. Or tune in live and watch the beats arrive.

One story. One structured event. Full context.

```
Story: Payment failed
Level: Error
Time: Mar 22, 2026, 10:15:03 AM (1.2s)
Origin: checkout / Payment

Notes:
  10:15:02 AM — User submitted payment
  10:15:02 AM — Charging card via Stripe
  10:15:03 AM — Gateway timed out after 5000ms
  10:15:03 AM — Write failed (error=Error: gateway timeout)

Error: gateway timeout
```

Every note timestamped. Every note connected to the same story. Origin context tells you exactly where in the app this happened. Clear labels that both humans and machines can parse without guessing.

---

## How It Works

### 1. Create a storyteller

Give it an origin — the *where* of your app. This gets attached to every story it tells.

```ts
import { Storyteller } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { where: { app: "checkout", page: "Payment" } },
});
```

### 2. Report beats as things happen

Each note captures a moment. Add context about who, what, where, and any errors.

```ts
story.report("User submitted payment", {
  who: { id: "user:413" },
  what: { amount: 49.99, currency: "USD" },
});

story.report("Charging card", {
  what: "stripe:charge",
  where: { service: "payments" },
});
```

### 3. Finish the story

When the operation is done, finish. Every beat you reported becomes one structured record — stored in the record's `notes` array, in order — and it's delivered to your audiences.

```ts
// Happy path
story.finish("Payment completed");

// Something concerning
story.finish("Payment slow but succeeded", { level: "warn" });

// Something broke
story.finish("Payment failed", { level: "oops", error });
```

That's it. Notes are cleared after telling, so the next story starts fresh.

---

## Or Watch It Happen

Collecting the whole story and emitting it at the end is the right shape for an audit record. It is the wrong shape when the work takes forty seconds and someone — a person, or an agent — wants to know what is going on right now.

So you can tune in:

```ts
const story = new Storyteller({
  origin: { who: "sync-agent" },
  narration: "live",
});

story.report("Fetching invoices");
story.report("Rate limited, backing off", { level: "warn" });
story.finish("Sync complete");
```

Each beat is emitted the moment you report it. The story record still lands at the end — live narration *adds* emissions, it never removes them.

The trick that makes this safe is correlation. Every beat carries the `storyId` of the story it belongs to, and a `sequence` number assigned the instant you call `report()`. So whoever is holding the stream can order and group the beats back into exactly the record collected narration would have produced.

That is the guarantee the whole design rests on: **however you tune in, you can recover the same story.** Neither mode is the lesser one.

Order by `sequence`, never by arrival time — audiences are asynchronous, and a slow one lands late.

---

## Three Levels, Three Meanings

| Level | How | Meaning |
|-------|-----|---------|
| **info** | `story.finish("Done")` | Everything worked. The default. |
| **warn** | `story.finish("Done", { level: "warn" })` | It worked, but something was off. Pay attention. |
| **oops** | `story.finish("Failed", { level: "oops", error })` | Something broke. Here's exactly what happened. |

Levels work on individual beats too: `story.report("Retrying", { level: "warn" })`.

---

## Context That Travels With the Story

Every note can carry structured context through three dimensions:

- **who** — The user, service, or actor involved
- **what** — The action, resource, or data being operated on
- **where** — The component, service, or location in the system

```ts
story.report("Permission check failed", {
  who: { id: "user:99", role: "viewer" },
  what: { action: "delete", resource: "project:42" },
  where: { component: "ProjectSettings", service: "auth" },
  error: new Error("insufficient permissions"),
});
```

When you read this story later — in a log viewer, a database, a Slack alert — you know *exactly* what happened without grepping through five files.

---

## Audiences: Choose Who Hears the Story

Not every story needs to go everywhere. Storyteller uses an **audience** system to control where stories are delivered.

```ts
import { Storyteller, dbAudience } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { where: { app: "admin" } },
  audiences: [
    dbAudience(async (event) => await db.insert("logs", event)),
  ],
});
```

The console audience is included by default. The db audience only listens to `warn` and `oops` — because you probably don't need to persist every success to your database.

### Target specific audiences per story

```ts
// Goes to all audiences
story.finish("Page loaded");

// Only goes to console and db
story.finish("Critical failure", { level: "oops", error }).to("console", "db");

// Only goes to db (skip console noise)
story.finish("Background job slow", { level: "warn" }).to("db");
```

### Build your own audience

An audience is just a name, an optional filter, and a handler:

```ts
story.audience.add({
  name: "slack",
  accepts: (event) => event.level === "Error",
  hear: async (event) => {
    const summary = event.summarize({ colors: false });
    await postToSlack(summary.text);
  },
});
```

Now every `oops` story automatically posts to Slack — with full context, structured data, and a human-readable summary.

---

## Summaries: Read the Story Back

Every story can generate a formatted summary on demand — for logging, alerting, or display.

```ts
story.report("User opened dashboard");
story.report("Loaded 6 widgets");
story.report("Dashboard ready");

const summary = story.summarize({
  title: "Dashboard loaded",
  level: "tell",
  detail: "full",
});

console.log(summary.text);
// Story: Dashboard loaded
// Level: Information
// Time: Mar 22, 2026, 3:42:18 PM (12ms)
// Origin: admin / Dashboard
// Notes:
//   3:42:18 PM — User opened dashboard
//   3:42:18 PM — Loaded 6 widgets
//   3:42:18 PM — Dashboard ready

console.log(summary.data);
// { title, level, when, durationMs, origin, notes, ... }
```

Summaries don't clear beats — they're a read-only preview. Call `finish()` when you're ready to emit and move on.

---

## Shared Instance: One Story Across Components

In a real app, the user's journey spans multiple components and services. `useStoryteller()` returns a shared singleton so notes from different parts of the system flow into the same story.

```ts
// In your auth service
import { useStoryteller } from "@lovelaces-io/storyteller";
const story = useStoryteller();
story.report("Session validated", { who: { service: "auth", region: "us-east-1" } });

// In your API layer
const story = useStoryteller();  // same instance
story.report("Fetched dashboard data", { what: { widgets: 6 } });

// In your UI component
const story = useStoryteller();  // still the same instance
story.report("Rendered dashboard");
story.finish("Dashboard loaded");
// All three notes are in this story
```

---

## Batch Reports

Have a collection of stored events? Generate a full report grouped by day:

```ts
import { writeStoryReport } from "@lovelaces-io/storyteller";

const events = await db.query("SELECT * FROM logs WHERE timestamp > ?", [weekAgo]);
const report = writeStoryReport(events, {
  timezone: "America/New_York",
  detail: "brief",
  colors: false,
});
```

```
Storyteller Report (America/New_York)
Range: Mar 15, 2026 – Mar 22, 2026

Mar 15, 2026
Story: User signed up
Level: Information
Time: Mar 15, 2026, 2:18:44 PM

Mar 22, 2026
Story: Payment failed
Level: Error
Time: Mar 22, 2026, 10:15:03 AM (1.2s)
Origin: checkout / Payment
Error: gateway timeout
```

---

## Real-World Scenario

Here's a complete flow — a user tries to update their profile, and it fails:

```ts
import { Storyteller, dbAudience } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { where: { app: "profile", page: "Settings" } },
  audiences: [
    dbAudience(async (event) => await db.insert("story_events", event)),
  ],
});

// User action
story.report("User updated email", {
  who: { id: "user:99", role: "member" },
  what: { setting: "timezone", value: "Europe/Berlin" },
  where: { component: "ProfileForm" },
});

// Validation
story.report("Validation passed", { what: "email format check" });

// Database write fails
try {
  await db.update("settings", { timezone: "Europe/Berlin" });
  story.finish("Profile updated");
} catch (error) {
  story.report("Write failed", {
    where: "primary-db",
    error,
  });
  story.finish("Failed to save profile", { level: "oops", error });
}
```

The `oops` story hits the console *and* the database. The full context — who the user was, what they were doing, where in the app it happened, and exactly which step failed — is all in one event.

No grepping. No guessing. Just the story.

---

## Structured for Machines Too

Every story event is a typed, serializable JSON object. AI agents, log aggregators, and monitoring tools can parse them without regex or guesswork:

```json
{
  "timestamp": "2026-03-22T14:15:03.421Z",
  "level": "Error",
  "title": "Payment failed",
  "durationMs": 1203,
  "origin": {
    "where": { "app": "checkout", "page": "Payment" }
  },
  "notes": [
    {
      "timestamp": "2026-03-22T14:15:02.218Z",
      "note": "User submitted payment",
      "who": { "id": "user:413" },
      "what": { "amount": 49.99, "currency": "USD" }
    },
    {
      "timestamp": "2026-03-22T14:15:03.421Z",
      "note": "Gateway timed out",
      "where": { "service": "payments" },
      "error": { "name": "Error", "message": "gateway timeout" }
    }
  ],
  "error": { "name": "Error", "message": "gateway timeout" }
}
```

Every field has a clear, unabbreviated name. `timestamp` not `ts`. `error` not `?`. Designed to be read by humans and parsed by machines without a decoder ring.

---

## Hand It Anything

`report()` doesn't want a string. It wants whatever you have.

```ts
story.report(await response.json());          // any API payload
story.report(caughtError);                     // cause chain preserved
story.report(new Map([["region", "us-east"]]));
story.report({ deployToken: "dt-9f2c-abc" });   // → "[redacted]"
```

Errors keep their `cause` chain. Maps and Sets are tagged. Class instances get an `@type`. A circular reference becomes `[Circular → path]`. Something enormous is truncated with an explicit marker, so you can tell "empty" from "too big." Secret-looking keys are redacted — best effort, by key name, so don't make it your only line of defense.

The normalizer never throws. A hostile object cannot break your logging.

---

## Nested Work: Chapters

Real work nests. An agent spawns subtasks; a batch runs one operation per item. `chapter()` gives you a child storyteller whose records link back to the parent:

```ts
story.report("Starting sync");

for (const account of accounts) {
  const chapter = story.chapter({ origin: { what: account.id } });
  chapter.report("Reconciling");
  chapter.finish(`Synced ${account.id}`);
}

story.finish("Sync complete");
```

Each chapter is a complete record of its own, carrying `parentStoryId`. Follow that field and the whole run comes back as a tree. Chapters share the parent's audiences and inherit its settings.

---

## For the Agents Doing the Work

Agents don't browse npm; they use what's in front of them. So:

- **`npx @lovelaces-io/storyteller init`** sets a project up in one command and adds a guidance block to your `AGENTS.md`, so every agent working in the repo knows how to narrate.
- **`STORYTELLER_FORMAT=ndjson`** turns output into one JSON object per line — for `jq`, a log shipper, or another agent reading a subprocess.
- **`llms.txt` and `AGENTS.md` ship inside the package**, so an agent finds guidance in `node_modules` without being told.

And the record is the same shape whoever did the work — an agent's automated run and your manual debugging session land in the same table, correlated by `origin`.

---

## At a Glance

| Feature | |
|---|---|
| **Zero dependencies** | Nothing to install but Storyteller itself |
| **Small footprint** | ~11 KB gzipped (ESM), measured on the built output |
| **Structured events** | Every story is a typed, serializable object |
| **Flexible context** | `who` / `what` / `where` on every note |
| **Audience system** | Console, database, Slack, or build your own |
| **Targeted delivery** | `.to("db")` sends only where you need |
| **On-demand summaries** | Human-readable text + structured data |
| **Batch reports** | Generate day-grouped reports from stored events |
| **Shared singleton** | `useStoryteller()` for cross-component stories |
| **TypeScript-first** | Full type safety, exported types for everything |
| **Live narration** | `narration: "live"` streams each beat as it happens; the record still lands |
| **Hand it anything** | `report()` takes any value and stores clean JSON; never throws |
| **Chapters** | Nested work as linked records, reconstructable as a tree |
| **Machine-readable** | NDJSON output, `llms.txt`, and `AGENTS.md` shipped in the package |
| **One command** | `npx @lovelaces-io/storyteller init` |
| **Human + machine readable** | Clear field names, consistent structure, no abbreviations |

---

## Install

```sh
export NODE_AUTH_TOKEN=ghp_xxx
npm install @lovelaces-io/storyteller
```

```ts
import { Storyteller } from "@lovelaces-io/storyteller";

const story = new Storyteller();
story.report("Hello, world");
story.finish("First story");
```

Your logs have a story to tell. Let them.
