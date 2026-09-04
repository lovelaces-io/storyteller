# @lovelaces-io/storyteller-view

Render [Storyteller](https://storyteller.lovelaces.io) stories, notes, and reports for humans. A story becomes a timeline of its notes, levels become badges, errors show their cause chain, nested values fold into a tree, and every marker the normalizer leaves (`@type`, `@truncated`, circular references, redaction) is shown as what it means instead of as a string.

Two renderers, one look: DOM for frontends, text for consoles and agent transcripts. Zero dependencies. Works on a `StoryEvent` straight from an audience, on a story read back from NDJSON or a database, and on a live `NoteEmission`.

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

## Theming

Override the custom properties on `.stv-story`, `.stv-note`, or any ancestor: `--stv-bg`, `--stv-fg`, `--stv-muted`, `--stv-border`, `--stv-surface`, `--stv-info`, `--stv-warn`, `--stv-error`, `--stv-accent`, `--stv-font`, `--stv-mono`, `--stv-radius`, `--stv-size`. Dark mode follows `prefers-color-scheme`.

## Safety

Story content is user input, URLs, and stack traces. Everything is inserted as text nodes; the package never assigns `innerHTML`.
