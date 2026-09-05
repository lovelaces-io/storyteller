# @lovelaces-io/storyteller-view

Render [Storyteller](https://storyteller.lovelaces.io) stories, notes, and reports for humans. A story becomes a timeline of its notes, levels become badges, errors show their cause chain, nested values fold into a tree, and every marker the normalizer leaves (`@type`, `@truncated`, circular references, redaction) is shown as what it means instead of as a string.

A visual language for stories. At a glance: the **storyboard**, a run inspector where every story is a row and a failure looks like one. Click in: the story as numbered steps with arrows, green until it turns, every step unfolding to its logs, data and error. Plus a story view, a text renderer for consoles, a timeline map and a Mermaid export. Zero dependencies. Works on a `StoryEvent` straight from an audience, on a story read back from NDJSON or a database, and on a live `NoteEmission`.

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

### The storyboard: a run inspector

```ts
import { createStoryboard, renderStoryboard, renderStoryFlow, renderStory } from "@lovelaces-io/storyteller-view";

// Once
panel.append(renderStoryboard(run, { title: "production" }));

// Or updatable in place, keeping the reader's tab, search and unfolded rows
const board = createStoryboard(run, { onSelect: (story) => detail.replaceChildren(renderStory(story)) });
panel.append(board.element);
board.update(moreStories);
```

Rows are stories, newest first: status, title with a one-line subtitle (*deadlock detected · turned at step 7 of 7*; *Waiting for health check · 12 s so far*), origin, beats, took, when. A row unfolds to its numbered steps with timings, green until the one that turned; a step unfolds to its logs, data and error. Tabs (All / Failing / Warnings / Running) and a search narrow the list. Options: `title`, `toolbar`, `tab`, `expanded`, `unfold`, `now`, `onSelect` (adds an *open* control per row).

`renderStoryFlow(story, { chapters })` is the steps view on its own; `renderStorySteps(node)` is just the list.

**Open in a dialog, pin what matters.** With `detail: "dialog"` a row opens in a modal over the feed — steps first, the full record folded beneath — so a live feed keeps flowing underneath. Every row and the dialog carry a **pin**: pinned stories sit in a strip at the top, survive updates and trimming, and persist for the browser session (`pinsKey` to name or disable that; `pins: false` to drop the feature). `onSave` adds a *save for later* action to the dialog — hand the story to a store, a report, wherever it should live. `board.open(id)`, `board.close()`, `board.pin(id)`, `board.unpin(id)`, `board.pinned()`.

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

- **0.5.0** — rows can open in a dialog over the feed (`detail: "dialog"`); pins with a pinned strip that survives updates and the session; `onSave` for a save-for-later action; `open`/`close`/`pin`/`unpin`/`pinned` on the board.
- **0.4.0** — the storyboard is a run inspector: rows with status, subtitle, origin, beats, took, when; tabs and search; rows unfold to steps, steps to detail; `createStoryboard` updates in place and keeps the reader's state, which `liveStoryboard` now uses. Card panels are gone. Durations read in hours and days.
- **0.3.0** — `liveStoryboard`: the board grows as beats arrive; running stories look running. Summary counts running stories.
- **0.2.0** — the visual language: `renderStoryboard` (a panel per story, at a glance) and `renderStoryFlow` (numbered steps with arrows, click in), raw detail unfolding in place. Also `renderStoryMap` (a timeline), `toMermaid` (flowchart or gantt), and `buildStoryMap` for the model.
- **0.1.1** — theme knobs set on an ancestor now apply: the stylesheet only reads `--stv-*`, it no longer defines them on the element itself.
- **0.1.0** — first release: DOM and text renderers, zero dependencies.
