/**
 * The Librarian: an MCP server over any StoryStore. Read-only by construction —
 * every tool is annotated read-only, and nothing here holds a reference to
 * append or prune. An agent that can delete your logs is a liability, and
 * nothing about asking "why did last night's sync fail?" needs writes.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StoryStore } from "@lovelaces-io/storyteller";
import { z } from "zod";
import { findRelated, getStory, searchStories, summarizePeriod } from "./library.js";

export type LibrarianOptions = {
  store: StoryStore;
  /** Shown to the client. Default "storyteller". */
  name?: string;
  version?: string;
  /** The clock relative durations count back from. Injectable for tests. */
  now?: () => Date;
};

const LEVELS = ["info", "warn", "oops", "Information", "Warning", "Error"] as const;
const DURATION = z.string().describe('A duration like "30s", "5m", "24h", "7d", "2w"');

/** Every tool is read-only, idempotent, and never destructive */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function reply(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function refuse(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Run a tool body, turning a thrown RangeError (a bad duration) into an answer the agent can act on */
async function attempt(body: () => Promise<unknown>) {
  try {
    return reply(await body());
  } catch (error) {
    if (error instanceof RangeError) return refuse(error.message);
    throw error;
  }
}

/**
 * Build the server. Connect it to a transport yourself — stdio for an agent,
 * an in-memory pair for a test.
 *
 * @example
 * ```ts
 * const server = createLibrarian({ store: fileStore("./stories.jsonl") });
 * await server.connect(new StdioServerTransport());
 * ```
 */
export function createLibrarian(options: LibrarianOptions): McpServer {
  const { store } = options;
  const now = options.now ?? (() => new Date());
  const server = new McpServer(
    { name: options.name ?? "storyteller", version: options.version ?? "0.1.0" },
    {
      instructions:
        "The Librarian keeps the stories Storyteller wrote: one structured narrative per unit of work — " +
        "who did it, what happened in order, how long it took, whether it worked. Ask with search_stories " +
        "(summaries), open one with get_story (the whole narrative and its chapters), get the shape of a period " +
        "with summarize_period, and pull on a thread with find_related. Everything is read-only.",
    }
  );

  server.registerTool(
    "search_stories",
    {
      title: "Search stories",
      description:
        "Find stories by what they mention, where they came from, how they ended, and when. Returns summaries " +
        "sized for a context window; open a result with get_story. Relative times count back from now.",
      inputSchema: {
        about: z.string().optional().describe("Text the title, notes, context or error mentions (case-insensitive)"),
        from: z.string().optional().describe("Text the origin (who / what / where) mentions"),
        level: z.enum(LEVELS).optional().describe("Exactly this level"),
        atLeast: z.enum(LEVELS).optional().describe("This level or worse"),
        failing: z.boolean().optional().describe("true: carried an error or closed at Error; false: neither"),
        since: DURATION.optional().describe("Began within this long ago"),
        until: DURATION.optional().describe("Began before this long ago"),
        slowerThan: DURATION.optional().describe("Took longer than this"),
        under: z.string().optional().describe("Chapters of this story id"),
        order: z.enum(["newest", "oldest"]).optional(),
        limit: z.number().int().min(1).max(100).optional().describe("At most this many summaries (default 20)"),
      },
      annotations: READ_ONLY,
    },
    (args) => attempt(() => searchStories(store, args, now))
  );

  server.registerTool(
    "get_story",
    {
      title: "Get a story",
      description:
        "One story, complete: every note in order with its context, the error with its cause chain, and the " +
        "story's chapters as summaries. Very long stories keep their first and last notes and say how many were cut.",
      inputSchema: { storyId: z.string().describe("The story id, from a search result") },
      annotations: READ_ONLY,
    },
    async ({ storyId }) => {
      const detail = await getStory(store, storyId);
      return detail ? reply(detail) : refuse(`No story with id ${storyId}. Search for it first: ids come from search_stories.`);
    }
  );

  server.registerTool(
    "summarize_period",
    {
      title: "Summarize a period",
      description:
        "The shape of a period: counts by level, how many failed, which titles recurred, which origins were active, " +
        "the slowest stories and the most recent failures. Default: the last 24 hours.",
      inputSchema: {
        since: DURATION.optional().describe('Start, as a duration before now (default "24h")'),
        until: DURATION.optional().describe("End, as a duration before now (default: now)"),
        from: z.string().optional().describe("Only stories whose origin mentions this"),
        about: z.string().optional().describe("Only stories that mention this"),
      },
      annotations: READ_ONLY,
    },
    (args) => attempt(() => summarizePeriod(store, args, now))
  );

  server.registerTool(
    "find_related",
    {
      title: "Find related stories",
      description:
        "Pull on a thread: the story's parent and chapters, its siblings under the same parent, other stories from " +
        "the same origin around the same time, and other stories with the same title (a recurring failure shows as one).",
      inputSchema: {
        storyId: z.string().describe("The story id"),
        window: DURATION.optional().describe('How far around the story to look for same-origin stories (default "1h")'),
        limit: z.number().int().min(1).max(100).optional().describe("At most this many per list (default 10)"),
      },
      annotations: READ_ONLY,
    },
    ({ storyId, window, limit }) =>
      attempt(async () => {
        const related = await findRelated(store, storyId, { window, limit });
        if (!related) throw new RangeError(`No story with id ${storyId}.`);
        return related;
      })
  );

  return server;
}
