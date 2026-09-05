# @lovelaces-io/storyteller-view

Render [Storyteller](https://storyteller.lovelaces.io) stories, notes, and reports for humans. A story becomes a timeline of its notes, levels become badges, errors show their cause chain, nested values fold into a tree, and every marker the normalizer leaves (`@type`, `@truncated`, circular references, redaction) is shown as what it means instead of as a string.

A visual language for stories. At a glance: the **storyboard**, a panel per story, a failure that looks like one. Click in: the **flow**, the story as numbered steps with arrows, green until it turns, every step unfolding to its logs, data and error. Plus a story view, a text renderer for consoles, a timeline map and a Mermaid export. Zero dependencies. Works on a `StoryEvent` straight from an audience, on a story read back from NDJSON or a database, and on a live `NoteEmission`.

```ts
import { renderStory } from "@lovelaces-io/storyteller-view";
import "@lovelaces-io/storyteller-view/style.css";

storyteller.audience.add({
  name: "panel",
  hear: (story) => document.querySelector("#log")!.append(renderStory(story)),
});
```

## API

### Frontends

- `renderStory(story, options?)` → `HTMLElement` — header, origin, notes in sequence order, closing error.
- `renderNote(note, options?)` → `HTMLElement` — one note on its own.
- `renderError(error, options?)` and `renderValue(value, options?)` — the building blocks, exported for custom layouts.

Options: `document` (required outside a browser), `expandDepth` (levels of nested values open by default, `1`), `locale`, `timeZone`, `showIds`.

### Consoles

```ts
import { renderStoryText } from "@lovelaces-io/storyteller-view";

storyteller.audience.add({
  name: "terminal",
  hear: (story) => console.log(renderStoryText(story, { colors: process.stdout.isTTY })),
});
```

- `renderStoryText(story, options?)` and `renderNoteText(note, options?)` → `string` — the same layout as the DOM, as indented text.
- `renderErrorText` and `renderValueText` — the building blocks.

Options: `colors` (ANSI, default `false`), `stacks` (include stack traces, default `true`), `maxDepth` (nested values printed before folding to their shape, default `4`), `indent`, `locale`, `timeZone`, `showIds`.

### The storyboard, and the flow

```ts
import { renderStoryboard, renderStoryFlow, renderStory } from "@lovelaces-io/storyteller-view";

// At a glance: one panel per story, chapters as sub-scenes, the gap between panels labelled
panel.append(renderStoryboard(run, {
  onSelect: (story) => detail.replaceChildren(
    renderStoryFlow(story, { chapters: run, unfold: "failed" }),   // click in: steps 1 → 2 → 3, arrows, where it turned
    renderStory(story),                                            // and the full record beneath
  ),
}));
```

- `renderStoryboard(stories, options?)` → `HTMLElement`. Summary line (`5 stories · 1 failed`), then panels in the order things happened: title, beats as sentences with a small "+21 s", chapters indented under the beat that started them, how it ended. A beat with data or an error unfolds in place to the raw payload. Options: `onSelect` (adds an *open* button per panel), `maxBeats` (default 8), `title`.
- `renderStoryFlow(story, options?)` → `HTMLElement`. Numbered steps with arrows coloured by how each went; the first failed step is marked as the turn; chapters (`chapters: [...]`, matched by `parentStoryId`) are steps with their own steps inside; the end says how it came out. `unfold: "none" | "failed" | "all"` controls which details start open.

### Live: a board that grows as beats arrive

```ts
import { liveStoryboard } from "@lovelaces-io/storyteller-view";

const live = liveStoryboard(document.querySelector("#board")!, { capacity: 50 });
story.audience.add(live.audience);          // in the browser: hears notes and stories directly
// or, tailing a file / an NDJSON stream:
for await (const line of lines) live.hear(JSON.parse(line));
```

A note opens or extends a running story (dashed border, a pulse, "still running"); the closing story replaces it. A burst of beats draws once. `stories()`, `flush()`, `clear()`, `destroy()`. This is the monitor: what an agent, a job, a server is doing right now.

### The timeline map

```ts
import { renderStoryMap, toMermaid } from "@lovelaces-io/storyteller-view";

panel.append(renderStoryMap(run, { onSelect: (story) => detail.replaceChildren(renderStory(story)) }));
toMermaid(run);                     // flowchart: stories, chapters, failures styled
toMermaid(run, { kind: "gantt" });  // lanes as sections, durations as bars
```

- `renderStoryMap(stories, options?)` → `SVGSVGElement` — stories on a time axis, lanes by origin, chapters beneath their parents with a connector, beats as ticks, level as colour. `onSelect` fires on click or Enter. Options: `width`, `rowHeight`, `gutter`, `title`, plus the render options.
- `toMermaid(stories, { kind, direction, maxLabel })` → `string` — the same map anywhere Mermaid renders, with no library at all.
- `buildStoryMap(stories)` → the model (`roots`, `rows`, `lanes`, time bounds) for custom drawings.

## Theming

Set the custom properties on `.stv-story`, `.stv-note`, or any ancestor (the stylesheet only reads them, so an ancestor's value is inherited, never shadowed): `--stv-bg`, `--stv-fg`, `--stv-muted`, `--stv-border`, `--stv-surface`, `--stv-info`, `--stv-warn`, `--stv-error`, `--stv-accent`, `--stv-font`, `--stv-mono`, `--stv-radius`, `--stv-size`. Dark mode follows `prefers-color-scheme`.

## Safety

Story content is user input, URLs, and stack traces. Everything is inserted as text nodes; the package never assigns `innerHTML`.

## Changelog

- **0.3.0** — `liveStoryboard`: the board grows as beats arrive; running stories look running. Summary counts running stories.
- **0.2.0** — the visual language: `renderStoryboard` (a panel per story, at a glance) and `renderStoryFlow` (numbered steps with arrows, click in), raw detail unfolding in place. Also `renderStoryMap` (a timeline), `toMermaid` (flowchart or gantt), and `buildStoryMap` for the model.
- **0.1.1** — theme knobs set on an ancestor now apply: the stylesheet only reads `--stv-*`, it no longer defines them on the element itself.
- **0.1.0** — first release: DOM and text renderers, zero dependencies.
