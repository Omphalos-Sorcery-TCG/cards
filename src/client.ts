/**
 * Data-loading client for the split card artifact (index.json + chunks/),
 * generalized so any consumer — the web app, a future game server, scripts —
 * can read the same data from any origin.
 *
 * The artifact is produced by scripts/split-cards.mjs:
 *   - index.json              one CardSummary per card (grid + filters)
 *   - chunks/cards-<n>.json   full Card records in fixed-size chunks
 *
 * Load the index once, then fetch a card's chunk on demand when its detail is
 * needed. Chunks are cached, so repeat lookups are free.
 */

import type { Card, CardSummary } from "./index";

export interface CardClient {
  /** Fetch the lightweight index (one summary per card). */
  loadIndex(): Promise<CardSummary[]>;
  /** Fetch the full card for a summary, loading (and caching) its detail chunk. */
  loadCardDetail(summary: CardSummary): Promise<Card>;
}

export interface CardClientOptions {
  /**
   * Base URL the data is served from, e.g. "https://cdn.example.com/cards/v1".
   * Defaults to "" (same origin): `/index.json`, `/chunks/cards-0.json`.
   */
  baseUrl?: string;
  /** Custom fetch implementation (for tests or non-browser runtimes). */
  fetch?: typeof fetch;
}

/** Create a {@link CardClient} bound to a data origin. */
export function createCardClient(options: CardClientOptions = {}): CardClient {
  const base = (options.baseUrl ?? "").replace(/\/$/, "");
  const doFetch = options.fetch ?? globalThis.fetch;
  const url = (path: string) => `${base}${path}`;

  // Detail chunks are fetched on demand and cached so repeat opens are free.
  const chunkCache = new Map<number, Promise<Card[]>>();

  function loadChunk(chunk: number): Promise<Card[]> {
    let pending = chunkCache.get(chunk);
    if (!pending) {
      pending = doFetch(url(`/chunks/cards-${chunk}.json`))
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to load chunk ${chunk} (${res.status})`);
          }
          return res.json() as Promise<Card[]>;
        })
        .catch((err) => {
          chunkCache.delete(chunk); // don't cache a failed fetch
          throw err;
        });
      chunkCache.set(chunk, pending);
    }
    return pending;
  }

  return {
    async loadIndex() {
      const res = await doFetch(url("/index.json"));
      if (!res.ok) {
        throw new Error(`Failed to load index.json (${res.status})`);
      }
      return (await res.json()) as CardSummary[];
    },

    async loadCardDetail(summary: CardSummary) {
      const chunk = await loadChunk(summary.chunk);
      const card = chunk.find((c) => c.name === summary.name);
      if (!card) {
        throw new Error(
          `Card "${summary.name}" missing from chunk ${summary.chunk}`,
        );
      }
      return card;
    },
  };
}
