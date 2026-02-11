import type { Card } from "@retro/shared";

export interface RuleOptions {
  levelRank: number;
  wildcardEnabled: boolean;
}

export const isBlackJoker = (card: Card): boolean => card.rank === 16;
export const isRedJoker = (card: Card): boolean => card.rank === 17;
export const isJoker = (card: Card): boolean => isBlackJoker(card) || isRedJoker(card);

export const isWildcard = (card: Card, options: RuleOptions): boolean => {
  return options.wildcardEnabled && card.suit === "H" && card.rank === options.levelRank;
};

export const splitWildcards = (cards: Card[], options: RuleOptions): { wildcards: Card[]; normalCards: Card[] } => {
  const wildcards: Card[] = [];
  const normalCards: Card[] = [];

  for (const card of cards) {
    if (isWildcard(card, options)) {
      wildcards.push(card);
    } else {
      normalCards.push(card);
    }
  }

  return { wildcards, normalCards };
};

export const isDoubleJokers = (cards: Card[]): boolean => {
  const hasBlack = cards.some((card) => card.rank === 16);
  const hasRed = cards.some((card) => card.rank === 17);
  return hasBlack && hasRed;
};

export const rankRange = (start: number, length: number): number[] => {
  return Array.from({ length }, (_, i) => start + i);
};

export const rankCounts = (cards: Card[]): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
};

export const containsUnsupportedRankForChain = (rank: number): boolean => {
  return rank < 3 || rank > 14;
};
