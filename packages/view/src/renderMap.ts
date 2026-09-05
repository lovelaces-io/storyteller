/**
 * The story map as SVG. Built with DOM APIs and text nodes only, like the
 * rest of the package; no drawing library.
 */
import { buildStoryMap, type MapNode, type StoryMap } from "./map";
import type { RenderOptions } from "./render";
import { formatDuration } from "./time";
import type { StoryRecord } from "./types";

export type StoryMapOptions = RenderOptions & {
  /** Drawing width in CSS pixels; the SVG scales to its container. Default 960. */
  width?: number;
  /** Height of one story row. Default 26. */
  rowHeight?: number;
  /** Width of the lane-label column. Default 150. */
  gutter?: number;
  /** Called when a story is clicked or activated with the keyboard — where the story view plugs in */
  onSelect?: (story: StoryRecord, node: MapNode) => void;
  /** Accessible name for the drawing. Default describes the count. */
  title?: string;
};

const SVG = "http://www.w3.org/2000/svg";
const AXIS_HEIGHT = 28;
const LANE_HEADER = 20;
const MIN_BAR = 6;
const TICKS = 5;

type Layout = {
  doc: Document;
  map: StoryMap;
  width: number;
  rowHeight: number;
  gutter: number;
  x: (time: number) => number;
};

function svg<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attributes: Record<string, string | number> = {},
  className?: string,
  text?: string
): SVGElementTagNameMap[K] {
  const element = doc.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (className) element.setAttribute("class", className);
  if (text !== undefined) element.textContent = text;
  return element;
}

function resolveDocument(options: RenderOptions): Document {
  const doc = options.document ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc) throw new Error("storyteller-view: no document available. Pass { document } when rendering outside a browser.");
  return doc;
}

/** Cut a label to roughly the pixels available, by character count at the map's font size */
function fit(text: string, pixels: number): string {
  const max = Math.max(4, Math.floor(pixels / 6.6));
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function describe(node: MapNode): string {
  const parts = [node.story.title, node.story.level];
  if (node.story.durationMs !== undefined) parts.push(formatDuration(node.story.durationMs));
  if (node.story.notes.length) parts.push(`${node.story.notes.length} ${node.story.notes.length === 1 ? "beat" : "beats"}`);
  if (node.story.error?.message) parts.push(node.story.error.message);
  if (node.orphan) parts.push("parent not in this set");
  return parts.join(" · ");
}

/** Render a set of stories as a map: lanes by origin, a row per story, chapters beneath their parents */
export function renderStoryMap(stories: StoryRecord[], options: StoryMapOptions = {}): SVGSVGElement {
  const doc = resolveDocument(options);
  const map = buildStoryMap(stories);
  const width = options.width ?? 960;
  const rowHeight = options.rowHeight ?? 26;
  const gutter = options.gutter ?? 150;
  const span = Math.max(1, map.end - map.start);
  const plotWidth = Math.max(40, width - gutter - 16);
  const x = (time: number) => gutter + ((time - map.start) / span) * plotWidth;
  const layout: Layout = { doc, map, width, rowHeight, gutter, x };

  const height = AXIS_HEIGHT + map.lanes.length * LANE_HEADER + map.rows.length * rowHeight + 8;
  const root = svg(doc, "svg", { viewBox: `0 0 ${width} ${Math.max(height, 60)}`, width, height: Math.max(height, 60), role: "img" }, "stv-map");
  root.setAttribute("aria-label", options.title ?? `Story map: ${map.count} ${map.count === 1 ? "story" : "stories"} in ${map.lanes.length} ${map.lanes.length === 1 ? "lane" : "lanes"}`);
  root.append(svg(doc, "title", {}, undefined, root.getAttribute("aria-label")!));

  if (!map.rows.length) {
    root.append(svg(doc, "text", { x: gutter, y: AXIS_HEIGHT + 20 }, "stv-map-empty", "No stories to map"));
    return root;
  }

  root.append(renderAxis(layout));

  let y = AXIS_HEIGHT;
  for (const lane of map.lanes) {
    const rows = map.rows.filter((node) => node.lane === lane);
    const band = svg(doc, "g", {}, "stv-map-lane-group");
    band.append(svg(doc, "rect", { x: 0, y, width, height: LANE_HEADER + rows.length * rowHeight }, "stv-map-band"));
    band.append(svg(doc, "text", { x: 10, y: y + 14 }, "stv-map-lane", fit(lane, gutter - 20)));
    root.append(band);
    y += LANE_HEADER;

    const rowTop = new Map<MapNode, number>();
    for (const node of rows) {
      rowTop.set(node, y);
      root.append(renderRow(layout, node, y, options));
      y += rowHeight;
    }
    // Connectors from each parent to its chapters, drawn after the rows so they sit on top
    for (const node of rows) {
      for (const child of node.children) {
        const parentTop = rowTop.get(node);
        const childTop = rowTop.get(child);
        if (parentTop === undefined || childTop === undefined) continue;
        const startX = x(node.start) + 6;
        const startY = parentTop + rowHeight - 4;
        const endY = childTop + rowHeight / 2;
        const endX = x(child.start);
        root.append(svg(doc, "path", { d: `M ${startX} ${startY} V ${endY} H ${endX}` }, "stv-map-link"));
      }
    }
  }
  return root;
}

function renderAxis(layout: Layout): SVGGElement {
  const { doc, map, width, gutter, x } = layout;
  const axis = svg(doc, "g", {}, "stv-map-axis-group");
  axis.append(svg(doc, "line", { x1: gutter, y1: AXIS_HEIGHT - 6, x2: width - 16, y2: AXIS_HEIGHT - 6 }, "stv-map-axis"));
  const span = Math.max(1, map.end - map.start);
  for (let i = 0; i <= TICKS; i++) {
    const time = map.start + (span * i) / TICKS;
    const at = x(time);
    axis.append(svg(doc, "line", { x1: at, y1: AXIS_HEIGHT - 10, x2: at, y2: AXIS_HEIGHT - 6 }, "stv-map-axis"));
    const label = svg(doc, "text", { x: at, y: AXIS_HEIGHT - 13, "text-anchor": i === 0 ? "start" : i === TICKS ? "end" : "middle" }, "stv-map-tick", `+${formatDuration(time - map.start)}`);
    axis.append(label);
  }
  return axis;
}

function renderRow(layout: Layout, node: MapNode, top: number, options: StoryMapOptions): SVGGElement {
  const { doc, rowHeight, width, x } = layout;
  const row = svg(doc, "g", { tabindex: 0, role: "button" }, "stv-map-row");
  row.setAttribute("data-level", node.story.level);
  row.setAttribute("data-story-id", node.id);
  row.setAttribute("data-depth", String(node.depth));
  if (node.orphan) row.setAttribute("data-orphan", "true");
  const description = describe(node);
  row.setAttribute("aria-label", description);
  row.append(svg(doc, "title", {}, undefined, description));

  const barX = x(node.start);
  const barWidth = Math.max(MIN_BAR, x(node.end) - barX);
  const barY = top + 5;
  const barHeight = rowHeight - 10;
  const bar = svg(doc, "rect", { x: barX, y: barY, width: barWidth, height: barHeight, rx: 4 }, "stv-map-bar");
  bar.setAttribute("data-level", node.story.level);
  if (node.orphan) bar.setAttribute("data-orphan", "true");
  row.append(bar);

  // Beats are thin ticks across the bar: they read under a label, and an
  // error beat is a wider one. The first beat is the bar's own left edge.
  for (const note of node.story.notes) {
    const time = Date.parse(note.timestamp);
    if (Number.isNaN(time)) continue;
    const failed = note.level === "Error" || note.error !== undefined;
    const tickWidth = failed ? 4 : 2;
    const at = Math.min(barX + barWidth - tickWidth, Math.max(barX, x(time) - tickWidth / 2));
    const beat = svg(doc, "rect", { x: at, y: barY + 2, width: tickWidth, height: barHeight - 4, rx: 1 }, "stv-map-beat");
    beat.setAttribute("data-level", failed ? "Error" : (note.level ?? "Information"));
    row.append(beat);
  }

  // Where the label goes: after the bar when there is room, inside it when
  // the bar is wide (a long-running story), otherwise before it. Indented by
  // depth so chapters read as chapters.
  const indent = node.depth * 10;
  const afterX = barX + barWidth + 8 + indent;
  const roomAfter = width - 16 - afterX;
  const roomBefore = barX - 8 - layout.gutter - indent;
  const labelY = top + rowHeight / 2 + 4;
  let label: SVGTextElement;
  if (roomAfter >= 60) {
    label = svg(doc, "text", { x: afterX, y: labelY, "text-anchor": "start" }, "stv-map-label");
    label.textContent = fit(node.story.title, roomAfter);
  } else if (barWidth >= 80) {
    label = svg(doc, "text", { x: barX + 8 + indent, y: labelY, "text-anchor": "start" }, "stv-map-label stv-map-label-inside");
    label.textContent = fit(node.story.title, barWidth - 16 - indent);
  } else {
    label = svg(doc, "text", { x: barX - 8, y: labelY, "text-anchor": "end" }, "stv-map-label");
    label.textContent = fit(node.story.title, Math.max(roomBefore, 24));
  }
  row.append(label);

  if (options.onSelect) {
    const select = () => options.onSelect!(node.story, node);
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter" || (event as KeyboardEvent).key === " ") {
        event.preventDefault();
        select();
      }
    });
    row.setAttribute("data-selectable", "true");
  }
  return row;
}
