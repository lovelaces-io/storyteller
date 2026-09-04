# Storyteller — repository guide

This is a workspace. The thing people install is one package inside it.

```
packages/core/       @lovelaces-io/storyteller — the library. Zero dependencies. Ships as-is.
  src/               source
  test/              vitest suites, plus examples.typecheck.ts (doc samples compiled for real)
  AGENTS.md          the guide that ships in the package, for agents using the library
  llms.txt           the compressed version
  snippets/          the block `storyteller init` writes into a consumer's AGENTS.md
packages/            add-on packages with real dependencies land here (sqlite, mcp)
site/                storyteller.lovelaces.io — Astro, deployed by Vercel from this folder
docs/                API reference and the narrative guide
scripts/             repo-level checks (docs drift, snippet sync, package contents)
```

## The one rule

`packages/core` has zero runtime dependencies and must stay that way. `npm run check:package`
fails CI if its `package.json` gains a dependency or its tarball gains an unexpected file.
Anything that needs a dependency is a separate package under `packages/`, opt-in, never
imported by core.

## Commands (from the root)

```
npm ci                 install everything (workspaces)
npm run typecheck      core
npm run lint           whole repo
npm test               core suites
npm run build          core → packages/core/dist
npm run check:docs     no deprecated verbs in docs or site samples
npm run check:snippet  the guidance block is identical everywhere it appears
npm run check:package  zero dependencies, intended files only
npm run release        publish core (needs an npm OTP)
cd site && npm run build   the site, with Pagefind indexing
```

## Working on the library

Read `packages/core/AGENTS.md` — it is the guide for using the library and it doubles as
the architecture reference. Coding standards are the Lovelaces ones: descriptive names,
JSDoc on every export, no `as any`, comments explain why.

## Working on the site

`site/` is its own npm project. Page content lives in `site/src/pages`; shared code
samples in `site/src/content/samples.ts`; the design system in `site/src/styles/global.css`.
The agents page and `/llms*.txt` import the shipped files from `packages/core` as raw text,
so they cannot drift from what ships.
