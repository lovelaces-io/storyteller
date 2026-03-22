# Storyteller

Storyteller is a lightweight TypeScript logging library that treats logs as stories: grouped notes emitted as a single structured event.

## Local Setup (GitHub Packages)

Storyteller is published to GitHub Packages. Create a GitHub Personal Access Token (classic) with `read:packages` (and `repo` if you need private access), then export it as `NODE_AUTH_TOKEN` before installing.

```sh
export NODE_AUTH_TOKEN=ghp_xxx
npm install @lovelaces-io/storyteller
```

## Quick Usage

```ts
import { Storyteller, useStoryteller } from "@lovelaces-io/storyteller";

const story = new Storyteller({
  origin: { where: { app: "admin", page: "Dashboard" } },
});

// Shared singleton for cross-component or cross-service usage
const shared = useStoryteller({
  origin: { where: { app: "admin" } },
});

story.note("User opened page");
story.note("Fetching data", { what: { resource: "challenges" } });

story.tell("Dashboard loaded");
story.warn("Something looks wrong");
story.oops("Something failed", new Error("timeout"));
```

Pass `reset: true` to `useStoryteller()` to reinitialize the shared instance.

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

For batch reports across many stories, use `writeStoryReport(stories, opts)`.

## Audiences

The default console audience groups and colors logs. You can add custom audiences and target them per story:

```ts
import { dbAudience } from "@lovelaces-io/storyteller";

story.audience.add(dbAudience(async (event) => db.insert(event)));

story.oops("Critical failure", err).to("console", "db");
```

## Dev

```sh
npm run build        # Build ESM + CJS via tsup
npm run dev          # Watch mode
npm run test         # Run tests via vitest
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint
npm run test:console # Colored console demo (builds first)
```

## License

MIT
