/**
 * Types for the Sorcery TCG card data, modeled on the shape returned by
 * https://api.sorcerytcg.com/api/cards (snapshotted into public/cards.json by
 * scripts/download_cards.py).
 *
 * Also exports small pure helpers (image URLs, printings), the deck domain +
 * construction validation (./deck), and a data-loading client (./client).
 */

export type CardType =
  | "Avatar"
  | "Site"
  | "Minion"
  | "Magic"
  | "Artifact"
  | "Aura";

export type Rarity =
  | "Ordinary"
  | "Exceptional"
  | "Elite"
  | "Unique"
  | "None";

export type Finish = "Standard" | "Foil" | "Rainbow";

/** Elemental threshold requirements. Every stat block carries all four keys. */
export interface Thresholds {
  air: number;
  earth: number;
  fire: number;
  water: number;
}

/**
 * A stat block. The top-level `guardian` and each set's `metadata` share this
 * shape. Numeric fields are null when not applicable (e.g. a Site has no attack;
 * a Minion's `life` is null because minions use defence instead).
 */
export interface StatBlock {
  rarity: Rarity | null;
  type: CardType;
  rulesText: string;
  cost: number | null;
  attack: number | null;
  defence: number | null;
  life: number | null;
  thresholds: Thresholds;
}

/** One specific printing of a card: a unique slug, art, artist and finish. */
export interface Variant {
  /** e.g. "alp-apprentice_wizard-b-s" — also the image filename. */
  slug: string;
  finish: Finish;
  /** e.g. "Booster", "Welcome_Kit", "Preconstructed_Deck". */
  product: string;
  artist: string;
  flavorText: string;
  typeText: string;
}

/** A card as it appears within one set (with its printings and per-set stats). */
export interface CardSet {
  name: string;
  /** ISO date string, e.g. "2023-04-19T00:00:00.000Z". */
  releasedAt: string;
  metadata: StatBlock;
  variants: Variant[];
}

/** A unique card, spanning one or more sets. */
export interface Card {
  name: string;
  guardian: StatBlock;
  /** Element string, e.g. "Air", "None", or "Earth, Fire, Water, Air". */
  elements: string;
  /** Comma-separated subtypes, e.g. "Mortal" or "Beast, Dragon". May be "". */
  subTypes: string;
  sets: CardSet[];
}

/**
 * A lightweight per-card record used for grids, search and filters. Served as
 * index.json so a consumer needn't load every full Card up front; the full
 * record is fetched on demand from its chunk (see scripts/split-cards.mjs and
 * the client in ./client).
 */
export interface CardSummary {
  name: string;
  type: CardType;
  /** Rarity drives deck copy-limits; null for the odd card that has none. */
  rarity: Rarity | null;
  elements: string;
  /** Default printing slug, for the thumbnail image. */
  slug: string;
  /** Sets this card appears in; names + dates power a Set facet. */
  sets: { name: string; releasedAt: string }[];
  /** Index of the detail chunk holding this card's full record. */
  chunk: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Default base path for card art. Consumers serving images from elsewhere
 * (e.g. a CDN) can pass their own base to `imageUrl`.
 */
export const CARD_IMAGE_BASE = "/cards";

/** Image URL for a printing slug, under `base` (defaults to {@link CARD_IMAGE_BASE}). */
export function imageUrl(slug: string, base: string = CARD_IMAGE_BASE): string {
  return `${base.replace(/\/$/, "")}/${slug}.png`;
}

/** A flattened printing: a variant paired with the set it belongs to. */
export interface Printing {
  set: CardSet;
  variant: Variant;
}

/** All printings of a card, oldest set first, Standard finish before Foil. */
export function printings(card: Card): Printing[] {
  const finishRank: Record<string, number> = { Standard: 0, Foil: 1, Rainbow: 2 };
  return [...card.sets]
    .sort((a, b) => Date.parse(a.releasedAt) - Date.parse(b.releasedAt))
    .flatMap((set) =>
      [...set.variants]
        .sort((a, b) => (finishRank[a.finish] ?? 9) - (finishRank[b.finish] ?? 9))
        .map((variant) => ({ set, variant })),
    );
}

/** The default printing to show for a card (earliest set, first variant). */
export function defaultPrinting(card: Card): Printing {
  return printings(card)[0];
}

/** Split a comma-separated field ("Beast, Dragon") into trimmed parts. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export * from "./deck";
export * from "./client";
