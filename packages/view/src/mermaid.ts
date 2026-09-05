/**
 * The story map as Mermaid, so it renders anywhere Mermaid does — GitHub,
 * docs, a chat reply, an artifact — with no library at all.
 */
import { buildStoryMap, type MapNode } from "./map";
import { formatDuration } from "./time";
import type { Level, StoryRecord } from "./types";

export type MermaidOptions = {
  /** `flowchart`: stories as nodes, parent → chapter edges. `gantt`: lanes as sections, durations as bars. */
  kind?: "flowchart" | "gantt";
  /** Flowchart direction. Default "TB". */
  direction?: "TB" | "LR";
  /** Longest label before it is cut. Default 48. */
  maxLabel?: number;
};

const LEVEL_WORD: Record<Level, string> = { Information: "info", Warning: "warn", Error: "error" };

/** Mermaid labels sit inside quotes; a quote inside breaks the diagram, and a `#` or `;` can too */
function label(text: string, maxLabel: number): string {
  const cut = text.length > maxLabel ? `${text.slice(0, maxLabel - 1)}…` : text;
  const ENTITY: Record<string, string> = { "#": "#35;", ";": "#59;", '"': "#quot;" };
  // One pass, so an entity written for one character is not re-escaped by the next
  return cut.replace(/[\r\n]+/g, " ").replace(/[#;"]/g, (c) => ENTITY[c]!);
}

/** Node ids must be plain identifiers */
function ident(id: string, index: number): string {
  const clean = id.replace(/[^A-Za-z0-9_]/g, "");
  return `s${index}_${clean.slice(0, 12) || "x"}`;
}

/** Write the map out as Mermaid text */
export function toMermaid(stories: StoryRecord[], options: MermaidOptions = {}): string {
  const map = buildStoryMap(stories);
  const maxLabel = options.maxLabel ?? 48;
  const ids = new Map<MapNode, string>();
  map.rows.forEach((node, index) => ids.set(node, ident(node.id, index)));

  if (options.kind === "gantt") {
    const lines = ["gantt", "  dateFormat x", "  axisFormat %H:%M:%S", `  title Stories · ${map.count}`];
    for (const lane of map.lanes) {
      lines.push(`  section ${label(lane, maxLabel)}`);
      for (const node of map.rows.filter((row) => row.lane === lane)) {
        const indent = "  ".repeat(node.depth);
        const tags = node.failed ? "crit, " : node.story.level === "Warning" ? "active, " : "";
        const end = Math.max(node.end, node.start + 1);
        lines.push(`  ${indent}${label(node.story.title, maxLabel)} :${tags}${ids.get(node)}, ${node.start}, ${end}`);
      }
    }
    return lines.join("\n");
  }

  const lines = [`flowchart ${options.direction ?? "TB"}`];
  const describe = (node: MapNode) => {
    const parts = [LEVEL_WORD[node.story.level]];
    if (node.story.durationMs !== undefined) parts.push(formatDuration(node.story.durationMs));
    if (node.story.notes.length) parts.push(`${node.story.notes.length} ${node.story.notes.length === 1 ? "beat" : "beats"}`);
    return `${label(node.story.title, maxLabel)}<br/><small>${parts.join(" · ")}</small>`;
  };
  const emit = (node: MapNode, indent: string) => {
    const id = ids.get(node)!;
    if (node.children.length) {
      lines.push(`${indent}subgraph ${id}_run["${label(node.story.title, maxLabel)}"]`);
      lines.push(`${indent}  ${id}["${describe(node)}"]`);
      for (const child of node.children) emit(child, `${indent}  `);
      lines.push(`${indent}end`);
    } else {
      lines.push(`${indent}${id}["${describe(node)}"]`);
    }
  };
  for (const root of map.roots) emit(root, "  ");
  for (const node of map.rows) {
    for (const child of node.children) lines.push(`  ${ids.get(node)} --> ${ids.get(child)}`);
  }
  const failed = map.rows.filter((node) => node.failed).map((node) => ids.get(node)!);
  const warned = map.rows.filter((node) => !node.failed && node.story.level === "Warning").map((node) => ids.get(node)!);
  const orphans = map.rows.filter((node) => node.orphan).map((node) => ids.get(node)!);
  lines.push("  classDef error fill:#fde8e6,stroke:#c0392b,color:#7a1f14");
  lines.push("  classDef warn fill:#fff4d6,stroke:#b7791f,color:#5c3d0e");
  lines.push("  classDef orphan stroke-dasharray:4 3");
  if (failed.length) lines.push(`  class ${failed.join(",")} error`);
  if (warned.length) lines.push(`  class ${warned.join(",")} warn`);
  if (orphans.length) lines.push(`  class ${orphans.join(",")} orphan`);
  return lines.join("\n");
}
