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

Storyteller treats a sequence of events as a single **story** — not a pile of disconnected lines. You collect notes as things happen, then tell the story when it's done.

One story. One structured event. Full context.

```
Story: Payment failed
Level: oops
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

### 2. Collect notes as things happen

Each note captures a moment. Add context about who, what, where, and any errors.

```ts
story.note("User submitted payment", {
  who: { id: "user:413" },
  what: { amount: 49.99, currency: "USD" },
});

story.note("Charging card", {
  what: "stripe:charge",
  where: { service: "payments" },
});
```

### 3. Tell the story

When the operation is done, tell the story. All the notes get bundled into a single structured event and delivered to your audiences.

```ts
// Happy path
story.tell("Payment completed");

// Something concerning
story.warn("Payment slow but succeeded");

// Something broke
story.oops("Payment failed", new Error("gateway timeout"));
```

That's it. Notes are cleared after telling, so the next story starts fresh.

---

## Three Levels, Three Meanings

| Level | Method | Meaning |
|-------|--------|---------|
| **tell** | `story.tell()` | Everything worked. A story worth recording. |
| **warn** | `story.warn()` | It worked, but something was off. Pay attention. |
| **oops** | `story.oops()` | Something broke. Here's exactly what happened. |

---

## Context That Travels With the Story

Every note can carry structured context through three dimensions:

- **who** — The user, service, or actor involved
- **what** — The action, resource, or data being operated on
- **where** — The component, service, or location in the system

```ts
story.note("Permission check failed", {
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
story.tell("Page loaded");

// Only goes to console and db
story.oops("Critical failure", error).to("console", "db");

// Only goes to db (skip console noise)
story.warn("Background job slow").to("db");
```

### Build your own audience

An audience is just a name, an optional filter, and a handler:

```ts
story.audience.add({
  name: "slack",
  accepts: (event) => event.level === "oops",
  hear: async (event) => {
    const summary = event.summarize({ colorize: false });
    await postToSlack(summary.text);
  },
});
```

Now every `oops` story automatically posts to Slack — with full context, structured data, and a human-readable summary.

---

## Summaries: Read the Story Back

Every story can generate a formatted summary on demand — for logging, alerting, or display.

```ts
story.note("User opened dashboard");
story.note("Loaded 6 widgets");
story.note("Dashboard ready");

const summary = story.summarize({
  title: "Dashboard loaded",
  level: "tell",
  verbosity: "full",
});

console.log(summary.text);
// Story: Dashboard loaded
// Level: tell
// Time: Mar 22, 2026, 3:42:18 PM (12ms)
// Origin: admin / Dashboard
// Notes:
//   3:42:18 PM — User opened dashboard
//   3:42:18 PM — Loaded 6 widgets
//   3:42:18 PM — Dashboard ready

console.log(summary.data);
// { title, level, when, durationMs, origin, notes, ... }
```

Summaries don't clear notes — they're a read-only preview. Call `tell()`, `warn()`, or `oops()` when you're ready to emit and move on.

---

## Shared Instance: One Story Across Components

In a real app, the user's journey spans multiple components and services. `useStoryteller()` returns a shared singleton so notes from different parts of the system flow into the same story.

```ts
// In your auth service
import { useStoryteller } from "@lovelaces-io/storyteller";
const story = useStoryteller();
story.note("Session validated", { who: { id: "user:42" } });

// In your API layer
const story = useStoryteller();  // same instance
story.note("Fetched dashboard data", { what: { widgets: 6 } });

// In your UI component
const story = useStoryteller();  // still the same instance
story.note("Rendered dashboard");
story.tell("Dashboard loaded");
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
  verbosity: "brief",
  colorize: false,
});
```

```
Storyteller Report (America/New_York)
Range: Mar 15, 2026 – Mar 22, 2026

Mar 15, 2026
Story: User signed up
Level: tell
Time: Mar 15, 2026, 2:18:44 PM

Mar 22, 2026
Story: Payment failed
Level: oops
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
story.note("User updated email", {
  who: { id: "user:99", role: "member" },
  what: { field: "email", value: "new@example.com" },
  where: { component: "ProfileForm" },
});

// Validation
story.note("Validation passed", { what: "email format check" });

// Database write fails
try {
  await db.update("users", { email: "new@example.com" });
  story.tell("Profile updated");
} catch (error) {
  story.note("Write failed", {
    where: "primary-db",
    error,
  });
  story.oops("Failed to save profile", error);
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
  "level": "oops",
  "title": "Payment failed",
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

## At a Glance

| Feature | |
|---|---|
| **Zero dependencies** | Nothing to install but Storyteller itself |
| **Tiny footprint** | ~13KB bundled (ESM) |
| **Structured events** | Every story is a typed, serializable object |
| **Flexible context** | `who` / `what` / `where` on every note |
| **Audience system** | Console, database, Slack, or build your own |
| **Targeted delivery** | `.to("db")` sends only where you need |
| **On-demand summaries** | Human-readable text + structured data |
| **Batch reports** | Generate day-grouped reports from stored events |
| **Shared singleton** | `useStoryteller()` for cross-component stories |
| **TypeScript-first** | Full type safety, exported types for everything |
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
story.note("Hello, world");
story.tell("First story");
```

Your logs have a story to tell. Let them.
