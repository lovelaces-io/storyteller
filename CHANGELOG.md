# Changelog

## 0.1.0 — First public release

### Breaking Changes

- **Renamed `ts` field to `timestamp`** on `StoryNote`, `StoryEventBase`, and `StorySummaryNote`. This affects all stored events and any code that references the `ts` field directly. Search and replace `\.ts` → `.timestamp` in consumer code.

### Improvements

- Extracted shared utilities (`ANSI`, `getLevelColor`, `formatOrigin`, `colorizeJsonSections`, `countBrackets`) into `src/utils.ts` — no more duplication across modules.
- Removed all `as any` type casts — replaced with proper type narrowing.
- Applied Lovelaces coding standards across entire codebase: descriptive variable names, JSDoc comments on every function, no abbreviations.
- Improved log output format for human and machine readability:
  - `Story:` label instead of `StorytellerSummary:`
  - Explicit `Level:` line
  - `Error:` instead of `?:` for error lines
  - `Data:` label for JSON output section
  - Em dash (`—`) separators in note lines
- Console audience now uses shared ANSI constants instead of hardcoded escape codes.
- Exported `StoryError` type (was previously internal but used in public types).
- Added ESLint with typescript-eslint configuration.
- Added MIT LICENSE file.

### Documentation

- Added `docs/API.md` — complete API reference with signatures and examples.
- Added `docs/HOW-IT-WORKS.md` — narrative-style guide covering the problem, approach, and all features.
- Updated README with dev commands, audience examples, and license.
- Fleshed out `ai-context/product-rules.md` with API stability, design constraints, and coding conventions.

### Infrastructure

- Published to npm registry (previously GitHub Packages only).
- Added `.gitignore` — removed `node_modules/` and `dist/` from git tracking.
- Added `repository`, `homepage`, `bugs`, and `keywords` to `package.json`.
