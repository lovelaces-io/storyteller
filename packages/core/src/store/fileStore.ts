/**
 * A StoryStore on one JSON-lines file. Node only — it needs the filesystem —
 * so it ships from `@lovelaces-io/storyteller/store/file`, never from the root.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StoryEvent } from "../storyteller";
import type { StoredStory, StoryQuery, StoryStore } from "./storyStore";
import { applyQuery, toStoredStory } from "./storyStore";

export type FileStore = StoryStore & {
  /** Where the stories are */
  readonly path: string;
  /** Resolves once every write queued so far has reached the file — call before exiting */
  flush(): Promise<void>;
};

/**
 * Append-only: `append` writes one line, reads parse the file, `prune`
 * rewrites it without the old stories. Simple on purpose. Right for a
 * single process and a few hundred thousand stories; past that, an adapter
 * with an index is the next step, and it answers the same queries.
 *
 * Writes are serialized so two appends cannot interleave and a prune cannot
 * race an append. A line that does not parse — a crash mid-write — is skipped,
 * never fatal: a store that cannot read its own file is not much of a store.
 *
 * @example
 * ```ts
 * import { fileStore } from "@lovelaces-io/storyteller/store/file";
 * const stories = fileStore("./stories.jsonl");
 * story.audience.add(storeAudience(stories));
 * ```
 */
export function fileStore(path: string): FileStore {
  // Every write waits for the one before it
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  async function readAll(): Promise<Map<string, StoredStory>> {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return new Map();
      throw error;
    }
    const stories = new Map<string, StoredStory>();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const story = JSON.parse(line) as StoredStory;
        if (typeof story?.storyId === "string" && typeof story.timestamp === "string") {
          // Last write wins, and moves the story to the end like the memory store
          stories.delete(story.storyId);
          stories.set(story.storyId, story);
        }
      } catch {
        // a torn line
      }
    }
    return stories;
  }

  return {
    path,
    async flush() {
      await queue;
    },
    async append(event: StoryEvent | StoredStory) {
      const line = `${JSON.stringify(toStoredStory(event))}\n`;
      await serialized(async () => {
        await mkdir(dirname(path), { recursive: true });
        await appendFile(path, line, "utf8");
      });
    },
    async get(storyId: string) {
      return (await readAll()).get(storyId);
    },
    async query(criteria: StoryQuery = {}) {
      return applyQuery((await readAll()).values(), criteria);
    },
    async children(parentStoryId: string) {
      return applyQuery((await readAll()).values(), { parentStoryId, order: "oldest" });
    },
    async prune(before: Date) {
      return serialized(async () => {
        const stories = await readAll();
        const boundary = before.getTime();
        const kept: StoredStory[] = [];
        let removed = 0;
        for (const story of stories.values()) {
          if (Date.parse(story.timestamp) < boundary) removed++;
          else kept.push(story);
        }
        if (removed === 0) return 0;
        const temporary = `${path}.${process.pid}.tmp`;
        await writeFile(temporary, kept.map((story) => JSON.stringify(story)).join("\n") + (kept.length ? "\n" : ""), "utf8");
        await rename(temporary, path);
        return removed;
      });
    },
  };
}
