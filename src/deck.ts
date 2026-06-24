/**
 * Deck domain model and construction-rule validation for Sorcery: Contested Realm.
 *
 * Rules are taken verbatim from the official rulebook ("Building Your Own Decks",
 * p.26): exactly one Avatar, an Atlas of >=30 site cards, a Spellbook of >=60
 * spell cards, and per-rarity copy limits. validateDeck() is the single source of
 * truth — run on the client for live feedback as a deck is built.
 */

import type { CardType, Rarity } from "./index";

/** The two card decks a player builds (the Avatar sits outside both). */
export type DeckSection = "spellbook" | "atlas";

/** One stack of a card within a deck section. */
export interface DeckCard {
  name: string;
  quantity: number;
  section: DeckSection;
}

/** A user's deck: an Avatar plus spellbook and atlas stacks. */
export interface Deck {
  id?: string;
  name: string;
  /** Card name of the chosen Avatar, or null while still being built. */
  avatar: string | null;
  cards: DeckCard[];
}

/** The minimum a card lookup must provide for validation. */
export interface CardMeta {
  type: CardType;
  rarity: Rarity | null;
}

// --- Construction constants (rulebook p.26) -------------------------------

export const MIN_ATLAS = 30;
export const MIN_SPELLBOOK = 60;

/** Max copies of a single card by rarity. Unknown/None falls back to 4. */
export const RARITY_COPY_LIMIT: Record<string, number> = {
  Ordinary: 4,
  Exceptional: 3,
  Elite: 2,
  Unique: 1,
};

export function copyLimit(rarity: Rarity | null): number {
  return (rarity && RARITY_COPY_LIMIT[rarity]) ?? 4;
}

/** Which section a card belongs to based on its type (Avatars belong to neither). */
export function sectionForType(type: CardType): DeckSection | "avatar" {
  if (type === "Avatar") return "avatar";
  if (type === "Site") return "atlas";
  return "spellbook";
}

// --- Validation -----------------------------------------------------------

export interface DeckProblem {
  code:
    | "no-avatar"
    | "avatar-not-avatar"
    | "atlas-too-small"
    | "spellbook-too-small"
    | "wrong-section"
    | "over-copy-limit"
    | "bad-quantity"
    | "unknown-card";
  message: string;
  /** Card name the problem relates to, when applicable. */
  card?: string;
}

export interface DeckValidation {
  valid: boolean;
  problems: DeckProblem[];
  spellbookCount: number;
  atlasCount: number;
}

/**
 * Validate a deck against the construction rules.
 * @param deck   the deck being built
 * @param lookup resolves a card name to its type/rarity (built from the index)
 */
export function validateDeck(
  deck: Deck,
  lookup: (name: string) => CardMeta | undefined,
): DeckValidation {
  const problems: DeckProblem[] = [];
  let spellbookCount = 0;
  let atlasCount = 0;

  // Avatar
  if (!deck.avatar) {
    problems.push({ code: "no-avatar", message: "Choose exactly one Avatar." });
  } else {
    const meta = lookup(deck.avatar);
    if (!meta) {
      problems.push({
        code: "unknown-card",
        message: `Unknown Avatar "${deck.avatar}".`,
        card: deck.avatar,
      });
    } else if (meta.type !== "Avatar") {
      problems.push({
        code: "avatar-not-avatar",
        message: `"${deck.avatar}" is not an Avatar.`,
        card: deck.avatar,
      });
    }
  }

  // Cards
  for (const entry of deck.cards) {
    const meta = lookup(entry.name);
    if (!meta) {
      problems.push({
        code: "unknown-card",
        message: `Unknown card "${entry.name}".`,
        card: entry.name,
      });
      continue;
    }

    if (!Number.isInteger(entry.quantity) || entry.quantity < 1) {
      problems.push({
        code: "bad-quantity",
        message: `"${entry.name}" has an invalid quantity.`,
        card: entry.name,
      });
      continue;
    }

    const expected = sectionForType(meta.type);
    if (expected === "avatar") {
      problems.push({
        code: "wrong-section",
        message: `"${entry.name}" is an Avatar and can't go in a deck.`,
        card: entry.name,
      });
      continue;
    }
    if (expected !== entry.section) {
      problems.push({
        code: "wrong-section",
        message: `"${entry.name}" belongs in the ${expected}, not the ${entry.section}.`,
        card: entry.name,
      });
    }

    const limit = copyLimit(meta.rarity);
    if (entry.quantity > limit) {
      problems.push({
        code: "over-copy-limit",
        message: `"${entry.name}" (${meta.rarity ?? "—"}) allows at most ${limit} ${
          limit === 1 ? "copy" : "copies"
        }.`,
        card: entry.name,
      });
    }

    if (entry.section === "atlas") atlasCount += entry.quantity;
    else spellbookCount += entry.quantity;
  }

  if (atlasCount < MIN_ATLAS) {
    problems.push({
      code: "atlas-too-small",
      message: `Atlas needs at least ${MIN_ATLAS} sites (has ${atlasCount}).`,
    });
  }
  if (spellbookCount < MIN_SPELLBOOK) {
    problems.push({
      code: "spellbook-too-small",
      message: `Spellbook needs at least ${MIN_SPELLBOOK} spells (has ${spellbookCount}).`,
    });
  }

  return { valid: problems.length === 0, problems, spellbookCount, atlasCount };
}
