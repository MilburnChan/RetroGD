import type { Card, CardCombination } from "@retro/shared";
import { rankPower, sortCardsAsc } from "../cards";
import { containsUnsupportedRankForChain, isJoker, rankCounts, RuleOptions, splitWildcards } from "./wildcard";

const INVALID_COMBO: CardCombination = {
  type: "invalid",
  length: 0,
  primaryRank: 0,
  chainLength: 0,
  kickerRanks: [],
  wildcardCount: 0,
  effectiveRanks: []
};

const isJokerBomb = (cards: Card[]): boolean => {
  if (cards.length !== 4) return false;
  const black = cards.filter((card) => card.rank === 16).length;
  const red = cards.filter((card) => card.rank === 17).length;
  return black === 2 && red === 2;
};

const allSameRankWithWildcard = (cards: Card[], size: number, options: RuleOptions): CardCombination | null => {
  if (cards.length !== size) return null;
  const { wildcards, normalCards } = splitWildcards(cards, options);
  const counts = rankCounts(normalCards);
  if (counts.size > 1) return null;

  const baseRank = counts.keys().next().value as number | undefined;
  const useRank = baseRank ?? options.levelRank;

  if (useRank >= 16 && wildcards.length > 0) {
    return null;
  }

  if ((counts.get(useRank) ?? 0) + wildcards.length !== size) {
    return null;
  }

  return {
    type: size === 2 ? "pair" : size === 3 ? "triple" : "bomb",
    length: size,
    primaryRank: rankPower(useRank),
    wildcardCount: wildcards.length,
    effectiveRanks: Array.from({ length: size }, () => rankPower(useRank))
  };
};

const evaluateStraightLike = (
  cards: Card[],
  options: RuleOptions,
  unit: 1 | 2 | 3,
  comboType: "straight" | "consecutive_pairs" | "steel"
): CardCombination | null => {
  const total = cards.length;
  if (comboType === "straight" && total !== 5) return null;
  if (comboType === "consecutive_pairs" && total !== 6) return null;
  if (comboType === "steel" && total !== 6) return null;

  const chainLength = total / unit;
  if (!Number.isInteger(chainLength)) return null;

  const { wildcards, normalCards } = splitWildcards(cards, options);
  const counts = rankCounts(normalCards);

  for (const rank of counts.keys()) {
    if (containsUnsupportedRankForChain(rank)) {
      return null;
    }
  }

  for (let start = 3; start + chainLength - 1 <= 14; start += 1) {
    const targetRanks = new Set<number>();
    for (let r = start; r < start + chainLength; r += 1) {
      targetRanks.add(r);
    }

    let needed = 0;
    let valid = true;
    for (const [rank, count] of counts.entries()) {
      if (!targetRanks.has(rank)) {
        valid = false;
        break;
      }
      if (count > unit) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    for (const rank of targetRanks.values()) {
      const count = counts.get(rank) ?? 0;
      needed += unit - count;
    }

    if (needed !== wildcards.length) continue;

    return {
      type: comboType,
      length: total,
      primaryRank: rankPower(start + chainLength - 1),
      chainLength,
      wildcardCount: wildcards.length,
      effectiveRanks: Array.from(targetRanks.values()).flatMap((rank) =>
        Array.from({ length: unit }, () => rankPower(rank))
      )
    };
  }

  return null;
};

const evaluateStraightFlush = (cards: Card[], options: RuleOptions): CardCombination | null => {
  if (cards.length !== 5) return null;

  const { wildcards, normalCards } = splitWildcards(cards, options);
  if (normalCards.some((card) => isJoker(card))) return null;
  if (normalCards.some((card) => containsUnsupportedRankForChain(card.rank))) return null;

  const normalSuits = [...new Set(normalCards.map((card) => card.suit).filter((suit) => suit !== "BJ" && suit !== "RJ"))];
  const suitCandidates = (normalSuits.length === 0 ? ["S", "H", "C", "D"] : normalSuits) as Array<"S" | "H" | "C" | "D">;

  for (const suit of suitCandidates) {
    if (normalCards.some((card) => card.suit !== suit)) {
      continue;
    }

    const counts = rankCounts(normalCards);
    if ([...counts.values()].some((count) => count > 1)) {
      continue;
    }

    for (let start = 3; start + 4 <= 14; start += 1) {
      let needed = 0;
      for (let rank = start; rank < start + 5; rank += 1) {
        const count = counts.get(rank) ?? 0;
        needed += 1 - count;
      }

      if (needed !== wildcards.length) {
        continue;
      }

      const effectiveRanks = Array.from({ length: 5 }, (_, idx) => rankPower(start + idx));
      return {
        type: "straight_flush",
        length: 5,
        primaryRank: rankPower(start + 4),
        chainLength: 5,
        wildcardCount: wildcards.length,
        effectiveRanks
      };
    }
  }

  return null;
};

const evaluateTripleWithPair = (cards: Card[], options: RuleOptions): CardCombination | null => {
  if (cards.length !== 5) return null;

  const { wildcards, normalCards } = splitWildcards(cards, options);
  const counts = rankCounts(normalCards);

  for (let tripleRank = 2; tripleRank <= 17; tripleRank += 1) {
    for (let pairRank = 2; pairRank <= 17; pairRank += 1) {
      if (tripleRank === pairRank) continue;

      let needed = 0;
      let valid = true;

      for (const [rank] of counts.entries()) {
        if (rank !== tripleRank && rank !== pairRank) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;

      const tripleCount = counts.get(tripleRank) ?? 0;
      const pairCount = counts.get(pairRank) ?? 0;

      if (tripleCount > 3 || pairCount > 2) continue;

      if (tripleRank >= 16 && tripleCount < 3) continue;
      if (pairRank >= 16 && pairCount < 2) continue;

      needed = 3 - tripleCount + (2 - pairCount);
      if (needed !== wildcards.length) continue;

      return {
        type: "triple_with_pair",
        length: 5,
        primaryRank: rankPower(tripleRank),
        kickerRanks: [rankPower(pairRank)],
        wildcardCount: wildcards.length,
        effectiveRanks: [
          rankPower(tripleRank),
          rankPower(tripleRank),
          rankPower(tripleRank),
          rankPower(pairRank),
          rankPower(pairRank)
        ]
      };
    }
  }

  return null;
};

const evaluateBomb = (cards: Card[], options: RuleOptions): CardCombination | null => {
  if (cards.length < 4) return null;
  const combo = allSameRankWithWildcard(cards, cards.length, options);
  if (!combo) return null;
  if (combo.type !== "bomb") return null;
  if (combo.primaryRank >= 16) return null;
  return combo;
};

export const evaluateCombinationWithRule = (cards: Card[], options: RuleOptions): CardCombination => {
  if (cards.length === 0) {
    return { ...INVALID_COMBO };
  }

  const sorted = sortCardsAsc(cards);
  const len = sorted.length;

  if (len === 1) {
    const card = sorted[0] as Card;
    return {
      type: "single",
      length: 1,
      primaryRank: rankPower(card.rank),
      wildcardCount: 0,
      effectiveRanks: [rankPower(card.rank)]
    };
  }

  if (isJokerBomb(sorted)) {
    return {
      type: "joker_bomb",
      length: 4,
      primaryRank: 100,
      wildcardCount: 0,
      effectiveRanks: [16, 16, 17, 17]
    };
  }

  const straightFlush = evaluateStraightFlush(sorted, options);
  if (straightFlush) return straightFlush;

  const bomb = evaluateBomb(sorted, options);
  if (bomb) return bomb;

  const steel = evaluateStraightLike(sorted, options, 3, "steel");
  if (steel) return steel;

  const consecutivePairs = evaluateStraightLike(sorted, options, 2, "consecutive_pairs");
  if (consecutivePairs) return consecutivePairs;

  const tripleWithPair = evaluateTripleWithPair(sorted, options);
  if (tripleWithPair) return tripleWithPair;

  const straight = evaluateStraightLike(sorted, options, 1, "straight");
  if (straight) return straight;

  const triple = allSameRankWithWildcard(sorted, 3, options);
  if (triple && triple.type === "triple") return triple;

  const pair = allSameRankWithWildcard(sorted, 2, options);
  if (pair && pair.type === "pair") return pair;

  return {
    ...INVALID_COMBO,
    length: len
  };
};

export const rankBag = (combo: CardCombination): number[] => {
  return combo.effectiveRanks ?? [];
};

export const evaluateHandAsRanksOnly = (cards: Card[]): Map<number, number> => {
  return rankCounts(cards.filter((card) => !isJoker(card)));
};
