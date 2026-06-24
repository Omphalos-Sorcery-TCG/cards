#!/usr/bin/env node
/**
 * Split the full card snapshot (cards.json) into:
 *   - index.json            a lightweight summary per card (grid + filters)
 *   - chunks/cards-N.json   full Card records in fixed-size chunks
 *
 * A consumer loads index.json once, then fetches a card's chunk on demand (see
 * src/client.ts). Regenerate after download_cards.py refreshes the snapshot.
 *
 * Usage:
 *   node scripts/split-cards.mjs [dataDir]
 *
 * dataDir is where cards.json lives and where index.json + chunks/ are written,
 * resolved against the current working directory. Defaults to ../public
 * (this package's own data dir). A consuming app can target its own public dir:
 *   node node_modules/@omphalos/cards/scripts/split-cards.mjs public
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const SRC = join(DATA_DIR, "cards.json");
const OUT_INDEX = join(DATA_DIR, "index.json");
const OUT_CHUNK_DIR = join(DATA_DIR, "chunks");

/** Cards per detail chunk. Roughly aligns with a grid's page size. */
const CHUNK_SIZE = 100;

// Mirrors defaultPrinting() in src/index.ts: earliest set, then Standard finish
// before Foil/Rainbow. Kept in sync by hand (no build step for the script).
const finishRank = { Standard: 0, Foil: 1, Rainbow: 2 };

function defaultSlug(card) {
  const sets = [...card.sets].sort(
    (a, b) => Date.parse(a.releasedAt) - Date.parse(b.releasedAt),
  );
  for (const set of sets) {
    const variants = [...set.variants].sort(
      (a, b) => (finishRank[a.finish] ?? 9) - (finishRank[b.finish] ?? 9),
    );
    if (variants[0]) return variants[0].slug;
  }
  return "";
}

const cards = JSON.parse(readFileSync(SRC, "utf8"));

const seen = new Set();
for (const card of cards) {
  if (seen.has(card.name)) {
    throw new Error(
      `Duplicate card name "${card.name}" — detail lookup keys on name, which must be unique.`,
    );
  }
  seen.add(card.name);
}

rmSync(OUT_CHUNK_DIR, { recursive: true, force: true });
mkdirSync(OUT_CHUNK_DIR, { recursive: true });

const index = [];
let chunkId = 0;
for (let i = 0; i < cards.length; i += CHUNK_SIZE) {
  const slice = cards.slice(i, i + CHUNK_SIZE);
  writeFileSync(
    join(OUT_CHUNK_DIR, `cards-${chunkId}.json`),
    JSON.stringify(slice),
  );
  for (const card of slice) {
    index.push({
      name: card.name,
      type: card.guardian.type,
      rarity: card.guardian.rarity,
      elements: card.elements,
      slug: defaultSlug(card),
      sets: card.sets.map((s) => ({ name: s.name, releasedAt: s.releasedAt })),
      chunk: chunkId,
    });
  }
  chunkId++;
}

writeFileSync(OUT_INDEX, JSON.stringify(index));
console.log(
  `Wrote index.json (${index.length} cards) and ${chunkId} chunks of ${CHUNK_SIZE} → ${OUT_CHUNK_DIR}`,
);
