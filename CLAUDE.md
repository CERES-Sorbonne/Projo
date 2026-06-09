# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server (also copies data/manifestes → public/)
npm run build        # production build (also copies manifestes)
npm run preview      # preview the production build
```

No test suite or linter is configured.

## Architecture

Static site generated with **Astro 5** + **React 18** islands, deployed to GitHub Pages. The site displays a collection of digitized books with IIIF viewing and full-text search.

### Data layer (build-time only)

All data processing happens at build time in `src/lib/`:

- **`parseData.ts`** — reads `data/metadata.csv` and `data/transcriptions/*.xml`, exposes `getLivres()`, `getColonnesMeta()`, `getLivreAvecTranscription()`, `getChunksTranscription()`. Do not modify this for XML rendering changes.
- **`xmlRules.ts`** — declarative XML→HTML rules. **This is the only file to modify** when adapting XML rendering or adding a new XML schema. Add a new entry to `SCHEMA_RULES` and implement detection logic in `detecterSchema()`.

The `DATA_PATH` env var overrides the default `./data` location (used in CI for a separate data repo).

### Pages

- `src/pages/index.astro` — home page, grid of books
- `src/pages/recherche.astro` — passes data to `MoteurFacettes` React island
- `src/pages/livres/[id].astro` — book detail page with side-by-side or tabbed layout, handles URL anchors, persists display mode in `sessionStorage`

### React islands

- **`MoteurFacettes.jsx`** (`client:load`) — search engine with facets. Builds two fuzzy-search indexes at mount: one on book metadata, one on transcription chunks (~300 chars with 80-char overlap). Search combines substring + fuzzy matching, scores chunks by word co-occurrence and proximity.
- **`CloverViewer.jsx`** (`client:only="react"`) — IIIF viewer wrapping `@samvera/clover-iiif`. **Must import Clover dynamically inside a `useEffect`** — never as a static import — or the Astro build fails with `document is not defined`.

### Viewer ↔ transcription sync

Bidirectional sync via `window` CustomEvents:
- `clover:pagechange` (viewer → transcription): emitted by `canvasIdCallback`
- `clover:goto` (transcription → viewer): listened by `SyncPlugin` registered in Clover's `plugins[].imageViewer.controls`
- An `ignoreNextRef` flag prevents feedback loops

**Assumption**: canvas index i in the IIIF manifest corresponds to page i in the XML. A cover canvas or any offset will break sync.

### URL handling

Always use `url()` from `src/lib/url.ts` to build internal links. It prepends the `BASE_URL` prefix defined in `astro.config.mjs`. This also applies to relative `manifeste_url` values in the CSV.

### Manifeste files

IIIF manifests live in `data/manifestes/` and are copied to `public/manifestes/` at dev/build time. They are served statically. In CI, a `sed` pass replaces `http://localhost:4321` with the production URL before the build.

### Adding a new XML schema

1. Add a `const myRules: XmlRuleMap` in `xmlRules.ts`
2. Add it to `SCHEMA_RULES` with a key name
3. Add detection logic in `detecterSchema()` (checks root element name)

### CSV facets

Any column in `metadata.csv` beyond the reserved ones (`id`, `titre`, `auteur`, `manifeste_url`, `sous_titre`) becomes a search facet. Type is auto-detected (range/select/text). Force a type with column name prefixes: `range__`, `select__`, `text__`.

### Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds on push to `main` and deploys to GitHub Pages. The `SITE_URL` env var in the workflow controls the URL substitution. To adapt for a new deployment, update `site` and `base` in `astro.config.mjs` and `SITE_URL` in the workflow.

For deeper architecture detail, see `stackTechnique.md`.