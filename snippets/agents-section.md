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
