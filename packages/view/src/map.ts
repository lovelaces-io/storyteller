/**
 * The story map: a run as a shape.
 *
 * One story reads as a timeline. A run — the parent, its chapters, the retry
 * that finally failed — reads as a diagram: stories on a time axis, chapters
 * beneath their parents, beats as ticks, failures unmistakable. This module
 * is the model; render.ts draws it, mermaid.ts writes it out.
 */
import type { StoryRecord } from "./types";

export type MapNode = {
  /** The story id, or a synthesized one when the record has none */
  id: string;
  story: StoryRecord;
  /** Chapters, in the order they began */
  children: MapNode[];
  /** 0 for a root; a chapter is one deeper than its parent */
  depth: number;
  /** When the story began, ms since epoch: its first beat, or its end minus its duration */
  start: number;
  /** When it ended: the record's timestamp */
  end: number;
  /** Which lane it belongs to: the origin's who, or where, or "stories" */
  lane: string;
  /** Set when the parent was not in the set, so the story is drawn as a root and marked */
  orphan: boolean;
  /** Carried an error, or closed at Error level */
  failed: boolean;
};

export type StoryMap = {
  /** Top-level stories, in the order they began */
  roots: MapNode[];
  /** Every node, roots first then depth-first, in drawing order */
  rows: MapNode[];
  /** Lane names, in the order they first appear */
  lanes: string[];
  start: number;
  end: number;
  count: number;
};

const parse = (iso: string): number => {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
};

/** Where a story belongs on the map: its origin's who, else where, else a default lane */
export function laneOf(story: StoryRecord): string {
  const origin = story.origin;
  if (!origin) return "stories";
  for (const key of ["who", "where", "what"] as const) {
    const value = origin[key];
    if (typeof value === "string" && value) return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const inner of ["app", "service", "name"]) {
        const candidate = (value as { [key: string]: unknown })[inner];
        if (typeof candidate === "string" && candidate) return candidate;
      }
    }
  }
  return "stories";
}

function boundsOf(story: StoryRecord): { start: number; end: number } {
  const end = parse(story.timestamp);
  const firstBeat = story.notes.length ? Math.min(...story.notes.map((note) => parse(note.timestamp)).filter((t) => t > 0)) : Infinity;
  let start = firstBeat !== Infinity ? firstBeat : end;
  if (story.durationMs !== undefined && end - story.durationMs < start) start = end - story.durationMs;
  if (start > end) start = end;
  return { start, end };
}

/** Build the model. Chapters attach to their parents by `parentStoryId`; the rest are roots. */
export function buildStoryMap(stories: StoryRecord[]): StoryMap {
  const nodes = new Map<string, MapNode>();
  const ordered: MapNode[] = [];
  stories.forEach((story, index) => {
    const id = story.storyId ?? `story-${index}`;
    // The same story twice — passed as itself and again among its chapters — is one story
    if (nodes.has(id)) return;
    const { start, end } = boundsOf(story);
    const node: MapNode = {
      id,
      story,
      children: [],
      depth: 0,
      start,
      end,
      lane: laneOf(story),
      orphan: false,
      failed: story.level === "Error" || story.error !== undefined,
    };
    nodes.set(id, node);
    ordered.push(node);
  });

  const roots: MapNode[] = [];
  for (const node of ordered) {
    const parentId = node.story.parentStoryId;
    const parent = parentId !== undefined ? nodes.get(parentId) : undefined;
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      node.orphan = parentId !== undefined;
      roots.push(node);
    }
  }

  const byStart = (a: MapNode, b: MapNode) => a.start - b.start || a.end - b.end;
  roots.sort(byStart);
  const rows: MapNode[] = [];
  const lanes: string[] = [];
  const visit = (node: MapNode, depth: number, seen: Set<string>, parentLane?: string) => {
    if (seen.has(node.id)) return; // a cycle in parent ids cannot recurse forever
    seen.add(node.id);
    node.depth = depth;
    // A chapter lives in its parent's lane, so a run stays together on the map
    if (parentLane !== undefined) node.lane = parentLane;
    if (!lanes.includes(node.lane)) lanes.push(node.lane);
    rows.push(node);
    node.children.sort(byStart);
    for (const child of node.children) visit(child, depth + 1, seen, node.lane);
  };
  const seen = new Set<string>();
  for (const root of roots) visit(root, 0, seen);
  // Nodes only reachable through a cycle never got visited: draw them as roots too
  for (const node of ordered) {
    if (!seen.has(node.id)) {
      node.orphan = true;
      roots.push(node);
      visit(node, 0, seen);
    }
  }

  const start = rows.length ? Math.min(...rows.map((node) => node.start)) : 0;
  const end = rows.length ? Math.max(...rows.map((node) => node.end)) : 0;
  return { roots, rows, lanes, start, end, count: rows.length };
}
