# Changelog

All notable changes to Storyteller will be documented in this file.

## 0.4.0 — 2026-09-05

Stories become answerable: a store contract, redaction by value, a query vocabulary, and the Librarian. See [#41](https://github.com/lovelaces-io/storyteller/issues/41).

### Added

- **`StoryStore`.** A contract for where stories go and how they come back: `append`, `get`, `query`, `children`, `prune`. Structured `StoryQuery` criteria (`since`, `until`, `level`, `minimumLevel`, `about`, `from`, `parentStoryId`, `slowerThanMs`, `failed`, paging) so every adapter answers the same questions. `canonicalRow()` publishes the schema an adapter stores; `matchesQuery()` / `applyQuery()` are the reference matcher every adapter is measured against.
- **`memoryStore()`.** The reference implementation: a bounded in-memory store, zero dependencies, browser-safe.
- **`fileStore(path)`.** One JSON-lines file, append-only, with `prune` rewriting it. Node only, so it ships from its own entry point: `@lovelaces-io/storyteller/store/file`.
- **`storeAudience(store, options?)`.** The one-line bridge from delivery to persistence. Keeps every level by default.
- **The Librarian.** `@lovelaces-io/storyteller-mcp`, a read-only MCP server over any `StoryStore`: `search_stories`, `get_story`, `summarize_period`, `find_related`. `npx -y @lovelaces-io/storyteller-mcp ./stories.jsonl` in `.mcp.json` and an agent answers "why did last night's sync fail?" from the stories the code wrote. Separate package; core stays at zero dependencies.
- **Query vocabulary.** `stories(store).about("checkout").from("payment-service").failing().since("24h")` — chainable, immutable, reads like the question. Clauses: `about`, `from`, `level`, `atLeast`, `failing`, `succeeding`, `slowerThan`, `since`, `until`, `under`, `newest`, `oldest`, `limit`, `skip`. Terminals: `all()`, `first()`, `count()`; an awaited builder resolves to `all()`. Durations as `"30s"` / `"5m"` / `"24h"` / `"7d"` / `"2w"` or milliseconds; `parseDuration()` exported. A builder compiles to a `StoryQuery`, so every adapter answers the same question.
- **Redaction by value.** Recognisable secret formats (Stripe, OpenAI/Anthropic, GitHub, GitLab, npm, Slack, Google, SendGrid, AWS access key ids, JWTs, PEM private keys, `Bearer`/`Basic` credentials, passwords in URLs, secrets in query parameters) are redacted inside any string — error messages and stacks included — keeping the text around them. Secret-shaped keys (`dbPassword`, `x-api-key`, `STRIPE_SECRET_KEY`) count too. `redactValues: "balanced" | "strict" | "off"` tunes it. Stores run the same pass at the boundary. `auditRedaction()` reports what would be redacted without changing anything. SECURITY.md says honestly what this does not guarantee.

## 0.3.1 — 2026-09-04

### Fixed

- **Custom audiences written for 0.2 compile again.** In 0.3.0, `accepts` and `hear` received the `Emission` union, so an audience that passed the event to a helper typed for `StoryEvent` failed to typecheck — found by the first real consumer on upgrade. `AudienceMember` is now generic on the kinds it hears: with no `hears` (the default), both callbacks receive a `StoryEvent` exactly as before; `hears: ["note"]` gives `NoteEmission`; `["note", "story"]` gives the union. Runtime behavior is unchanged.

## 0.3.0 — 2026-09-04

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
- **`npx @lovelaces-io/storyteller init`.** One command to adopt: installs the package, writes a configured storyteller, and adds agent guidance to `AGENTS.md` or `CLAUDE.md`. Idempotent and never destructive.
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
