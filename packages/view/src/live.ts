/**
 * The live storyboard: a board that grows as beats arrive.
 *
 * Feed it emissions — a NoteEmission opens or extends a story, a StoryEvent
 * closes it — and it keeps a storyboard current in a host element. A story
 * that has begun but not finished is drawn running: its title is its first
 * beat, its outcome is "still running", and it pulses. This is the monitor:
 * what an agent, a job, a server is doing right now, at a glance.
 *
 * It renders from the same records everything else does, so a page can tail
 * a stories.jsonl or an NDJSON stream and hand each parsed line straight in.
 */
import { renderStoryboard, type StoryboardOptions } from "./storyboard";
import type { Level, NoteRecord, StoryRecord } from "./types";

/** What the controller accepts: a live note, a closing story, or anything shaped like either */
export type LiveEmission =
  | (NoteRecord & { kind?: "note"; storyId: string })
  | (StoryRecord & { kind?: "story" });

export type LiveStoryboardOptions = StoryboardOptions & {
  /** How many stories to keep on the board; the oldest finished ones go first. Default 50. */
  capacity?: number;
  /** Called after every redraw, with the stories as drawn */
  onChange?: (stories: StoryRecord[]) => void;
};

export type LiveStoryboard = {
  /** Take an emission. Safe to call with anything; what is not a note or a story is ignored. */
  hear(emission: unknown): void;
  /** The stories as currently drawn, newest last */
  stories(): StoryRecord[];
  /** Redraw now, rather than after the current burst of emissions */
  flush(): void;
  /** Forget everything and clear the board */
  clear(): void;
  /** Stop drawing; the host is left as it is */
  destroy(): void;
  /** An audience member for `story.audience.add(...)`, hearing notes and stories */
  readonly audience: { name: string; hears: ["note", "story"]; hear: (emission: unknown) => void };
};

const RUNNING_LEVEL: Record<string, Level> = { Information: "Information", Warning: "Warning", Error: "Error" };

function isNote(value: unknown): value is NoteRecord & { storyId: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record["note"] === "string" && typeof record["timestamp"] === "string" && typeof record["storyId"] === "string" && record["kind"] !== "story";
}

function isStory(value: unknown): value is StoryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record["title"] === "string" && typeof record["timestamp"] === "string" && Array.isArray(record["notes"]) && record["kind"] !== "note";
}

/** Attach a live storyboard to a host element */
export function liveStoryboard(host: HTMLElement, options: LiveStoryboardOptions = {}): LiveStoryboard {
  const capacity = Math.max(1, options.capacity ?? 50);
  const stories = new Map<string, StoryRecord>();
  let scheduled = false;
  let alive = true;
  const doc = options.document ?? host.ownerDocument;
  // A burst of beats in one tick draws once, after the burst: a microtask,
  // which exists everywhere the DOM does and needs no frame to be running
  const schedule = (fn: () => void) => queueMicrotask(fn);

  function draw(): void {
    scheduled = false;
    if (!alive) return;
    const list = [...stories.values()];
    host.replaceChildren(renderStoryboard(list, { ...options, document: doc }));
    options.onChange?.(list);
  }

  function requestDraw(): void {
    if (scheduled || !alive) return;
    scheduled = true;
    schedule(draw);
  }

  function trim(): void {
    while (stories.size > capacity) {
      // The oldest finished story goes first; a running one is worth more than a finished one
      let victim: string | undefined;
      for (const [id, story] of stories) {
        if (!story.running) { victim = id; break; }
      }
      stories.delete(victim ?? stories.keys().next().value!);
    }
  }

  function hear(emission: unknown): void {
    if (!alive) return;
    if (isStory(emission)) {
      const { kind: _kind, ...record } = emission as StoryRecord & { kind?: string };
      const id = record.storyId ?? `story-${stories.size}`;
      stories.delete(id);
      stories.set(id, { ...record, storyId: id });
    } else if (isNote(emission)) {
      const { kind: _kind, storyId, parentStoryId, origin, level, ...note } = emission as NoteRecord & { storyId: string };
      const existing = stories.get(storyId);
      const beat: NoteRecord = { ...note, ...(level && level !== "Information" ? { level } : {}) };
      if (existing && existing.running) {
        const worst = worstLevel(existing.level, level ?? "Information");
        stories.set(storyId, { ...existing, level: worst, timestamp: note.timestamp, notes: [...existing.notes, beat] });
      } else if (!existing) {
        const opened: StoryRecord = {
          timestamp: note.timestamp,
          level: RUNNING_LEVEL[level ?? "Information"] ?? "Information",
          title: note.note,
          storyId,
          notes: [beat],
          running: true,
        };
        if (parentStoryId !== undefined) opened.parentStoryId = parentStoryId;
        if (origin !== undefined) opened.origin = origin;
        stories.set(storyId, opened);
      } else {
        // A beat after its story closed: the record already has it, nothing to add
        return;
      }
    } else {
      return;
    }
    trim();
    requestDraw();
  }

  const controller: LiveStoryboard = {
    hear,
    stories: () => [...stories.values()],
    flush: () => { if (scheduled || stories.size >= 0) draw(); },
    clear: () => { stories.clear(); requestDraw(); },
    destroy: () => { alive = false; },
    audience: { name: options.title ? `storyboard:${options.title}` : "storyboard", hears: ["note", "story"], hear },
  };
  draw();
  return controller;
}

function worstLevel(a: Level, b: Level): Level {
  const rank: Record<Level, number> = { Information: 0, Warning: 1, Error: 2 };
  return rank[b] > rank[a] ? b : a;
}
