# Storyteller

Storyteller is a lightweight TypeScript logging library that treats logs as stories: grouped notes emitted as a single structured event.

## Local Setup (GitHub Packages)

Storyteller is published to GitHub Packages. Create a GitHub Personal Access Token (classic) with `read:packages` (and `repo` if you need private access), then export it as `NODE_AUTH_TOKEN` (preferred) or `GITHUB_TOKEN` before installing. `NODE_AUTH_TOKEN` is read by npm for GitHub Packages auth.

```sh
export NODE_AUTH_TOKEN=ghp_xxx
npm install
```

## Quick Usage

```ts
import { Storyteller } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { where: { app: "admin", page: "Dashboard" } },
});

story.note("User opened page");
story.note("Fetching data", { what: { resource: "challenges" } });

story.tell("Dashboard loaded");
story.warn("Something looks wrong");
story.oops("Something failed", new Error("timeout"));
```

Use `story.reset()` to clear notes without emitting a story.

## Notes + Context

`who`, `what`, and `where` can be strings or objects, and notes can carry errors.

```ts
story.note("Write failed", {
  where: "primary-db",
  error: new Error("db timeout"),
});
```

## Summaries

Summaries are on-demand and do not clear notes.

```ts
const summary = story.summarize({
  title: "Dashboard loaded",
  level: "tell",
  verbosity: "full",
});
console.log(summary.text);
console.log(summary.data);
```

For many stories, use `writeStoryReport(stories, opts)`.

## Audiences

The default console audience groups and colors logs. You can add audiences and target them per story:

```ts
story.oops("Critical failure", err).to("console", "db");
```

## Dev

- `npm run test:console` for a colored console demo

MIT License
