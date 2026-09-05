/**
 * The story flow: one story as steps, 1 → 2 → 3, with arrows between them.
 *
 * This is the "click in" of the storyboard. Every beat and every chapter is a
 * step in the order it happened; each reads green until the one that went
 * wrong, and each unfolds to its logs, data and error. A chapter is a step
 * with its own steps inside, so arrows run from chapter to chapter and the
 * picture says how far things got and where they turned.
 */
import { buildStoryMap, type MapNode } from "./map";
import { renderError, renderValue, type RenderOptions } from "./render";
import { formatDuration, parseTime } from "./time";
import type { ErrorRecord, JsonValue, Level, NoteRecord, StoryRecord } from "./types";

export type StoryFlowOptions = RenderOptions & {
  /** Other stories that may be chapters of this one (matched by `parentStoryId`) */
  chapters?: StoryRecord[];
  /** Steps whose detail starts unfolded: "none" (default), "failed", or "all" */
  unfold?: "none" | "failed" | "all";
};

type Step =
  | { kind: "beat"; at: number; note: NoteRecord }
  | { kind: "chapter"; at: number; node: MapNode };

type Ctx = { doc: Document; options: StoryFlowOptions };

function el<K extends keyof HTMLElementTagNameMap>(ctx: Ctx, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = ctx.doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function resolveDocument(options: RenderOptions): Document {
  const doc = options.document ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc) throw new Error("storyteller-view: no document available. Pass { document } when rendering outside a browser.");
  return doc;
}

const STATUS_WORD: Record<Level, string> = { Information: "ok", Warning: "warning", Error: "failed" };

function beatLevel(note: NoteRecord): Level {
  return note.level === "Error" || note.error !== undefined ? "Error" : (note.level ?? "Information");
}

/** Render one story as a flow of steps. Pass the run's other stories as `chapters` to nest them. */
export function renderStoryFlow(story: StoryRecord, options: StoryFlowOptions = {}): HTMLElement {
  const ctx: Ctx = { doc: resolveDocument(options), options };
  const map = buildStoryMap([story, ...(options.chapters ?? []).filter((other) => other !== story)]);
  const node = map.rows.find((row) => row.story === story) ?? map.roots[0]!;
  return renderFlowFor(ctx, node, 0);
}

function renderFlowFor(ctx: Ctx, node: MapNode, depth: number): HTMLElement {
  const { story } = node;
  const flow = el(ctx, "section", "stv-flow");
  flow.dataset["level"] = story.level;
  flow.dataset["depth"] = String(depth);
  flow.dataset["storyId"] = node.id;

  const head = el(ctx, "header", "stv-flow-head");
  head.append(el(ctx, depth === 0 ? "h3" : "h4", "stv-flow-title", story.title));
  const status = el(ctx, "span", "stv-flow-status", STATUS_WORD[story.level]);
  status.dataset["level"] = story.level;
  head.append(status);
  const meta: string[] = [];
  if (node.lane !== "stories") meta.push(node.lane);
  if (story.durationMs !== undefined) meta.push(formatDuration(story.durationMs));
  if (meta.length) head.append(el(ctx, "span", "stv-flow-meta", meta.join(" · ")));
  flow.append(head);

  // Steps: beats and chapters, in the order they happened
  const steps: Step[] = [];
  const notes = [...story.notes]
    .map((note, index) => ({ note, index, key: note.sequence ?? index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((entry) => entry.note);
  notes.forEach((note, index) => steps.push({ kind: "beat", at: parseTime(note.timestamp)?.getTime() ?? node.start + index, note }));
  for (const child of node.children) steps.push({ kind: "chapter", at: child.start, node: child });
  steps.sort((a, b) => a.at - b.at || (a.kind === "beat" ? -1 : 1));

  // Where it turned: the first failed step, if any
  const failedAt = steps.findIndex((step) => (step.kind === "beat" ? beatLevel(step.note) === "Error" : step.node.failed));

  const list = el(ctx, "ol", "stv-flow-steps");
  steps.forEach((step, index) => {
    const item = el(ctx, "li", "stv-step");
    const level: Level = step.kind === "beat" ? beatLevel(step.note) : step.node.story.level;
    item.dataset["level"] = level;
    item.dataset["kind"] = step.kind;
    if (index === failedAt) item.dataset["turn"] = "true";
    if (failedAt !== -1 && index > failedAt) item.dataset["after"] = "true";

    const marker = el(ctx, "span", "stv-step-marker");
    marker.dataset["level"] = level;
    marker.append(el(ctx, "span", "stv-step-number", String(index + 1)));
    marker.setAttribute("aria-label", `step ${index + 1}, ${STATUS_WORD[level]}`);

    const body = el(ctx, "div", "stv-step-body");
    if (step.kind === "beat") {
      const title = el(ctx, "div", "stv-step-title");
      title.append(el(ctx, "span", "stv-step-text", step.note.note), el(ctx, "span", "stv-step-when", offsetLabel(node.start, step.at)));
      body.append(title);
      if (step.note.error?.message && step.note.error.message !== step.note.note) body.append(el(ctx, "div", "stv-step-reason", step.note.error.message));
      const detail = beatDetail(ctx, step.note);
      if (detail) body.append(unfold(ctx, "logs and data", detail, shouldOpen(ctx, level)));
    } else {
      const title = el(ctx, "div", "stv-step-title");
      title.append(el(ctx, "span", "stv-step-text", step.node.story.title), el(ctx, "span", "stv-step-kind", "chapter"), el(ctx, "span", "stv-step-when", offsetLabel(node.start, step.at)));
      body.append(title);
      body.append(renderFlowFor(ctx, step.node, depth + 1));
    }

    item.append(marker, body);
    list.append(item);
  });

  // The end: how it came out
  const end = el(ctx, "li", "stv-step stv-step-end");
  end.dataset["level"] = story.level;
  const endMarker = el(ctx, "span", "stv-step-marker stv-step-marker-end");
  endMarker.dataset["level"] = story.level;
  endMarker.append(el(ctx, "span", "stv-step-number", story.level === "Error" ? "✕" : story.level === "Warning" ? "!" : "✓"));
  const endBody = el(ctx, "div", "stv-step-body");
  const outcome = story.error?.message ? `failed: ${story.error.message}` : story.level === "Error" ? "failed" : story.level === "Warning" ? "finished with warnings" : "finished";
  endBody.append(el(ctx, "div", "stv-step-title stv-step-outcome", outcome));
  if (story.error && (story.error.stack || story.error.cause !== undefined || story.error.errors)) {
    endBody.append(unfold(ctx, "the error", renderError(story.error, ctx.options), shouldOpen(ctx, "Error")));
  }
  end.append(endMarker, endBody);
  list.append(end);

  flow.append(list);
  return flow;
}

function offsetLabel(start: number, at: number): string {
  const delta = at - start;
  return delta <= 0 ? "start" : `+${formatDuration(delta)}`;
}

function shouldOpen(ctx: Ctx, level: Level): boolean {
  const mode = ctx.options.unfold ?? "none";
  return mode === "all" || (mode === "failed" && level === "Error");
}

function unfold(ctx: Ctx, label: string, content: HTMLElement, open: boolean): HTMLDetailsElement {
  const details = el(ctx, "details", "stv-step-unfold");
  details.open = open;
  details.append(el(ctx, "summary", "stv-step-summary", label), content);
  return details;
}

function beatDetail(ctx: Ctx, note: NoteRecord): HTMLElement | undefined {
  const parts: HTMLElement[] = [];
  for (const key of ["who", "what", "where"] as const) {
    const value: JsonValue | undefined = note[key];
    if (value === undefined) continue;
    const block = el(ctx, "div", "stv-step-context");
    block.append(el(ctx, "span", "stv-key", key), renderValue(value, { ...ctx.options, expandDepth: ctx.options.expandDepth ?? 2 }));
    parts.push(block);
  }
  const error: ErrorRecord | undefined = note.error;
  if (error) parts.push(renderError(error, ctx.options));
  if (!parts.length) return undefined;
  const detail = el(ctx, "div", "stv-step-detail");
  detail.append(...parts);
  return detail;
}
