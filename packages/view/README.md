# @lovelaces-io/storyteller-view

Render [Storyteller](https://storyteller.lovelaces.io) stories, notes, and reports for humans. A story becomes a timeline of its notes, levels become badges, errors show their cause chain, nested values fold into a tree, and every marker the normalizer leaves (`@type`, `@truncated`, circular references, redaction) is shown as what it means instead of as a string.

Two renderers, one look: DOM for frontends, text for consoles and agent transcripts. And a map: a whole run as a shape. Zero dependencies. Works on a `StoryEvent` straight from an audience, on a story read back from NDJSON or a database, and on a live `NoteEmission`.

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

### The story map

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

- **0.2.0** — the story map: `renderStoryMap` (SVG, lanes, chapters, beats, click to open) and `toMermaid` (flowchart or gantt). `buildStoryMap` exposes the model.
- **0.1.1** — theme knobs set on an ancestor now apply: the stylesheet only reads `--stv-*`, it no longer defines them on the element itself.
- **0.1.0** — first release: DOM and text renderers, zero dependencies.
