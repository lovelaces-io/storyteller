# Storyteller

Storyteller is a lightweight TypeScript logging library that treats logs as **stories** instead of isolated events.

A *story* is a grouped, structured log made up of time-ordered notes that explain **what happened and why**, emitted as a single record when the story is told.

The goal is fewer log records, richer context, and logs that are useful to both humans and machines.

---

## Local Setup (GitHub Packages)

Storyteller is published to GitHub Packages. Create a GitHub Personal Access Token (classic) with `read:packages` (and `repo` if you need private access), then export it as `NODE_AUTH_TOKEN` (preferred) or `GITHUB_TOKEN` before installing. `NODE_AUTH_TOKEN` is read by npm for GitHub Packages auth.

```sh
export NODE_AUTH_TOKEN=ghp_xxx
npm install
```

## Core Concepts

- **Storyteller**: a long-lived logger created at an app, page, or service level
- **Notes**: small breadcrumbs captured over time (`note()`)
- **Story**: the collection of notes leading up to an outcome
- **Tell / Warn / Oops**: emit the story as one structured log
- **Audiences**: destinations that hear stories (console, database today; email/Discord later)

When a story is told, its notes are cleared and the next activity begins a new story.

---

## Basic Usage

```ts
import { Storyteller, dbAudience } from "@lovelaces/storyteller";

const story = new Storyteller({
  origin: { where: { app: "admin", page: "Dashboard" } },
});

story.audience.add(
  dbAudience(async (event) => {
    // persist event to database or telemetry endpoint
  })
);

story.note("User opened page");
story.note("Fetching data", { what: { resource: "challenges" } });

story.tell("Dashboard loaded");
```

This emits **one log record** containing both notes.

---

## Logging Methods

```ts
story.tell("Something completed");   // informational
story.warn("Something looks wrong");  // warning
story.oops("Something failed", err);  // error
```

- All methods emit a single structured story
- Notes are automatically cleared after emission

---

## Notes

Notes are lightweight breadcrumbs captured before telling a story.

```ts
story.note("User changed form field", {
  what: { field: "email" },
  where: { component: "SignupForm" },
});
```

Each note may optionally include `who`, `what`, and `where`.

---

## Audiences

Audiences receive emitted stories.

- **Console**: built-in, receives all stories
- **Database**: optional, defaults to `warn` and `oops` only

```ts
story.audience.add({
  name: "db",
  accepts: (e) => e.level !== "tell",
  hear: async (event) => saveToDb(event),
});
```

By default, stories are sent to **all registered audiences**.

You can target specific audiences per story:

```ts
story.oops("Critical failure", err).to("console", "db");
```

---

## Why Storyteller

Traditional logging produces many disconnected records.

Storyteller:
- Groups related activity into one event
- Preserves timelines without log spam
- Produces JSON suitable for databases, analytics, and reports
- Remains readable in console output

---

## Status

Storyteller is early-stage and evolving.

Current audiences:
- Console
- Database / telemetry endpoint

Planned:
- Email
- Discord / chat alerts
- Story reports and summaries

---

MIT License
