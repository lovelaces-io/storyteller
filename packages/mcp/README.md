# @lovelaces-io/storyteller-mcp

The Librarian: an MCP server that lets an agent read the stories [Storyteller](https://storyteller.lovelaces.io) kept. Read-only.

Storyteller writes one structured narrative per unit of work. The Library keeps them. Ask the Librarian.

```jsonc
// .mcp.json
{
  "mcpServers": {
    "storyteller": {
      "command": "npx",
      "args": ["-y", "@lovelaces-io/storyteller-mcp", "./stories.jsonl"]
    }
  }
}
```

`./stories.jsonl` is the file a `fileStore` audience writes:

```ts
import { storeAudience } from "@lovelaces-io/storyteller";
import { fileStore } from "@lovelaces-io/storyteller/store/file";

story.audience.add(storeAudience(fileStore("./stories.jsonl")));
```

Then ask: *"why did last night's sync fail?"* The answer is sourced from the stories the code wrote.

## Tools

| tool | answers |
|---|---|
| `search_stories` | "the three stories where checkout failed yesterday" — summaries sized for a context window |
| `get_story` | one story, complete: every note in order, the error with its cause chain, its chapters |
| `summarize_period` | "what happened to billing this week" — counts, what recurred, what was slow, what failed |
| `find_related` | parent, chapters, siblings, same origin around the same time, same title |

Every tool is annotated read-only and the server never holds a reference to `append` or `prune`. Results are bounded: at most 100 summaries per search, 200 notes per story (first and last kept), 2000 characters per string, with explicit truncation markers. Redaction happened at capture and again at the storage boundary; nothing here can undo it.

## In code

```ts
import { createLibrarian } from "@lovelaces-io/storyteller-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createLibrarian({ store: anyStoryStore });
await server.connect(new StdioServerTransport());
```

Any `StoryStore` works: the file store, the in-memory store, or an adapter of your own.
