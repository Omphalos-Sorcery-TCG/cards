# @omphalos-sorcery-tcg/cards

Canonical card data for **Sorcery: Contested Realm**, shared across the Omphalos
projects (the web app today; a game server / rules engine later).

This package owns three things:

1. **Domain types** (`src/index.ts`) — `Card`, `CardSummary`, `StatBlock`, etc.,
   modeled on the official API, plus small pure helpers (`imageUrl`, `printings`).
2. **Deck domain + construction validation** (`src/deck.ts`) — `Deck`, `DeckCard`,
   and `validateDeck()` (rulebook p.26: one Avatar, Atlas ≥ 30, Spellbook ≥ 60,
   per-rarity copy limits).
3. **A data-loading client** (`src/client.ts`) — `createCardClient({ baseUrl })`
   returning `loadIndex()` / `loadCardDetail()`, so any consumer reads the same
   data from any origin.

> **Scope note.** This is *display + deck-construction* data. The structured,
> machine-executable card abilities a legal-move game engine needs do **not**
> live here yet — that's a future layer built on top of these types.

## Layout

```
src/
  index.ts          types + helpers (entry point)
  deck.ts           deck model + validateDeck()
  client.ts         createCardClient() data loader
scripts/
  download_cards.py pulls the API snapshot + ~3 GB of card images
  split-cards.mjs   derives index.json + chunks/ from the snapshot
```

## The data artifact (not in git)

Card data is large and regenerable, so it's **gitignored**, not committed:

- `download_cards.py` → `cards.json` (raw API snapshot) + `cards/<slug>.png` images.
- `split-cards.mjs` → `index.json` (one summary per card) + `chunks/cards-N.json`
  (full records, fetched on demand).

```bash
python scripts/download_cards.py     # writes ./public/cards.json + ./public/cards/
node scripts/split-cards.mjs         # writes ./public/index.json + ./public/chunks/
```

Both scripts accept a target `dataDir` as their first argument (resolved against
the current working directory), so a consumer can generate the artifact straight
into its own served directory:

```bash
node node_modules/@omphalos-sorcery-tcg/cards/scripts/split-cards.mjs public
python node_modules/@omphalos-sorcery-tcg/cards/scripts/download_cards.py public
```

## Consuming it

```ts
import { createCardClient, validateDeck, type CardSummary } from "@omphalos-sorcery-tcg/cards";

const cards = createCardClient({ baseUrl: "" }); // "" = same origin
const index = await cards.loadIndex();
const detail = await cards.loadCardDetail(index[0]);
```

During local development `apps/web` consumes this package **from source** via a
path alias (Vite + `tsconfig` `paths`), so no build step is required while
iterating — matching how the monorepo previously consumed its local types.

## Publishing (later)

`package.json` currently points `main`/`types`/`exports` at the TypeScript
source. Before publishing to a registry for JS consumers:

1. `npm run build` (emits `dist/` + `.d.ts` via `tsc`).
2. Repoint `exports` at `dist/` (e.g. `"."`: `./dist/index.js` + `./dist/index.d.ts`).
3. Consider `moduleResolution: NodeNext` with explicit file extensions for
   broad compatibility.

Then consumers can depend on a versioned `@omphalos-sorcery-tcg/cards` instead of a local
source alias, and the data artifact can ship as a CDN-hosted release asset.
