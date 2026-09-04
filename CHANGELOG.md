# Changelog

All notable changes to Storyteller will be documented in this file.

## Unreleased

Live narration and agent-first reporting. See [#31](https://github.com/lovelaces-io/storyteller/issues/31).

### Added

- **Live narration.** `narration: "live"` emits each beat the moment it is reported, instead of only at the end. The story record still lands at `finish()`. Configurable per instance, at runtime via `narrate()`, per beat via `{ live: true }`, or from `STORYTELLER_NARRATION`.
- **Emissions.** Audiences now hear a tagged union — `kind: "note"` or `kind: "story"` — and declare which kinds they want with `hears`. It defaults to `["story"]`, so existing audiences are unaffected.
- **Correlation.** Every beat and story carries a `storyId`; every beat carries a gap-free `sequence` assigned synchronously. Streamed beats reassemble into exactly the record collected narration would have produced.
- **`report()` accepts any value**, not just a string — errors, API responses, `Map`s, class instances, buffers.
- **`normalizeValue()` / `normalizeError()`.** Turn any value into something storable: `cause` chains preserved, circular references marked, oversized values truncated with an explicit `{ "@truncated": … }` marker, secret-looking keys redacted. Never throws.
- **`ndjsonAudience()`.** One JSON object per line, nothing else on the channel.
- **Environment configuration:** `STORYTELLER_NARRATION`, `STORYTELLER_FORMAT`, `STORYTELLER_LEVEL`, `STORYTELLER_COLOR`, `STORYTELLER_DEPRECATION_WARNINGS`.
- **`onAudienceError`.** Audience failures are reported instead of swallowed. Without a handler, one throttled console warning per audience.
- **`maxInFlight`.** Bounds in-flight deliveries per audience. Emissions dropped past the bound are counted in `droppedEmissions` on the closing story, so the loss is visible in the record.
- **`npx storyteller init`.** One command to adopt: installs the package, writes a configured storyteller, and adds agent guidance to `AGENTS.md` or `CLAUDE.md`. Idempotent and never destructive.
- **`snippets/agents-section.md`** — the guidance block to paste into a project's agent instructions, so every agent working in that repo knows how to narrate. Kept in sync by `npm run check:snippet`.
- **The published package now ships `llms.txt`, `AGENTS.md` and `snippets/`.** Previously only `dist` was published, so the files written for machine readers never reached one — an agent working in a project that installed Storyteller found no guidance in `node_modules`.
- **Chapters.** `chapter()` returns a child storyteller for nested work — an agent spawning subtasks, a batch running per-item operations. Each chapter emits its own record carrying `parentStoryId`, so a run reconstructs as a tree. Chapters share the parent's audience registry and inherit its settings.
- **`AudienceRegistry` is exported**, and a registry can be shared between storytellers via the `audience` option.
- **Level aliases.** `level` accepts `"info"`, `"warn"`, `"oops"`, `"error"`, or a stored label.

### Changed

- **`error.cause` is now normalized rather than kept as a live `Error`.** Previously the raw `Error` was stored, which serialized to `{}` — the cause was silently lost in every stored record. The chain is now preserved, depth-capped at 5.
- **Records carry two new fields**, `kind` and `storyId`, and beats carry `sequence`. Additive; both are optional on the record types so rows written by earlier versions still typecheck.
- **`consoleAudience` renders beats as one compact line each**, and still renders stories as a grouped block. It now hears both kinds.
- **Context values are normalized on the way in.** A circular object passed as `what` previously broke `JSON.stringify` inside `consoleAudience`; it is now marked and stored safely.
- **`origin` is normalized** like any other context.

### Deprecated

Removed at 1.0. The aliases behave identically and stay silent unless `STORYTELLER_DEPRECATION_WARNINGS=1`.

| Old | New |
|---|---|
| `note(text, context?)` | `report(input, context?)` |
| `tell(title)` | `finish(title)` |
| `warn(title)` | `finish(title, { level: "warn" })` |
| `oops(title, error?)` | `finish(title, { level: "oops", error })` |
| `narration: "both"` | `narration: "live"` |

`tell` will not be reintroduced with a new meaning. Reusing a familiar name with inverted
semantics stays a trap for anyone on 0.x long after the alias is gone.
