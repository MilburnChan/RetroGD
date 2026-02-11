import type { Card, CardSuit } from "@retro/shared";

export type HandArrangeMode = "default" | "power";
export type ArrangeGroupType = "joker_bomb" | "straight_flush" | "bomb" | "normal";

export interface ArrangeSlot {
  slotRank: number;
  cardId: string;
  isWildcardSubstitute: boolean;
  substituteRank?: number;
}

export interface ArrangeGroup {
  type: ArrangeGroupType;
  cards: Card[];
  strength: number;
  label: string;
  slots?: ArrangeSlot[];
}

export interface PowerArrangeCandidate {
  cards: Card[];
  groups: ArrangeGroup[];
  score: number;
  slots: ArrangeSlot[];
  signature: string;
}

export interface PowerArrangePreference {
  signature: string | null;
  styleKey: string | null;
  orderedCardIds: string[];
}

export type PowerCandidatePickReason = "signature" | "style" | "overlap" | "fallback";

export interface PowerCandidatePickResult {
  candidate: PowerArrangeCandidate;
  candidateIndex: number;
  reason: PowerCandidatePickReason;
}

export interface ArrangeResult {
  cards: Card[];
  groups: ArrangeGroup[];
  candidateCount: number;
  candidateIndex: number;
  candidate?: PowerArrangeCandidate;
}

const MAX_POWER_CANDIDATES = 12;

const suitWeight: Record<CardSuit, number> = {
  C: 0,
  D: 1,
  H: 2,
  S: 3,
  BJ: 4,
  RJ: 5
};

const flushSuitWeight: Record<Exclude<CardSuit, "BJ" | "RJ">, number> = {
  C: 0,
  D: 1,
  H: 2,
  S: 3
};

const rankPower = (rank: number): number => {
  if (rank === 2) return 15;
  return rank;
};

const isWildcard = (card: Card, levelRank: number): boolean => {
  return card.suit === "H" && card.rank === levelRank;
};

const isJoker = (card: Card): boolean => card.suit === "BJ" || card.suit === "RJ";

const sortCardsDefault = (cards: Card[]): Card[] => {
  return [...cards].sort((a, b) => {
    const byRank = rankPower(a.rank) - rankPower(b.rank);
    if (byRank !== 0) return byRank;
    const bySuit = suitWeight[a.suit] - suitWeight[b.suit];
    if (bySuit !== 0) return bySuit;
    return a.id.localeCompare(b.id);
  });
};

const keyByIds = (cards: Card[]): string => {
  return [...cards].map((card) => card.id).sort().join("|");
};

const removeByIds = (cards: Card[], ids: Set<string>): Card[] => {
  return cards.filter((card) => !ids.has(card.id));
};

const createUsedIdSet = (cards: Card[]): Set<string> => {
  return new Set(cards.map((card) => card.id));
};

const hasOverlap = (a: Card[], b: Card[]): boolean => {
  const ids = new Set(a.map((card) => card.id));
  return b.some((card) => ids.has(card.id));
};

const takeJokerBomb = (cards: Card[]): ArrangeGroup | null => {
  const blacks = sortCardsDefault(cards.filter((card) => card.suit === "BJ"));
  const reds = sortCardsDefault(cards.filter((card) => card.suit === "RJ"));
  if (blacks.length < 2 || reds.length < 2) {
    return null;
  }

  const selected = [...blacks.slice(0, 2), ...reds.slice(0, 2)];
  return {
    type: "joker_bomb",
    cards: selected,
    strength: 100_000,
    label: "王炸"
  };
};

const buildStraightFlushOptions = (cards: Card[], levelRank: number, maxOptions = 8): ArrangeGroup[] => {
  const wildcards = sortCardsDefault(cards.filter((card) => isWildcard(card, levelRank)));
  const nonWildcards = cards.filter(
    (card): card is Card & { suit: Exclude<CardSuit, "BJ" | "RJ"> } =>
      !isWildcard(card, levelRank) && card.suit !== "BJ" && card.suit !== "RJ"
  );

  const suitBuckets: Record<Exclude<CardSuit, "BJ" | "RJ">, Map<number, Card[]>> = {
    C: new Map(),
    D: new Map(),
    H: new Map(),
    S: new Map()
  };

  for (const card of nonWildcards) {
    const rankBucket = suitBuckets[card.suit].get(card.rank) ?? [];
    rankBucket.push(card);
    suitBuckets[card.suit].set(card.rank, sortCardsDefault(rankBucket));
  }

  const dedup = new Map<string, ArrangeGroup>();

  for (const suit of ["S", "H", "D", "C"] as const) {
    const bucketByRank = suitBuckets[suit];

    for (let length = 12; length >= 5; length -= 1) {
      for (let start = 3; start + length - 1 <= 14; start += 1) {
        const slots: ArrangeSlot[] = [];
        const orderedCards: Card[] = [];
        const missingRanks: number[] = [];

        for (let rank = start; rank < start + length; rank += 1) {
          const rankCards = bucketByRank.get(rank) ?? [];
          const card = rankCards[0];
          if (card) {
            orderedCards.push(card);
            slots.push({
              slotRank: rank,
              cardId: card.id,
              isWildcardSubstitute: false
            });
          } else {
            missingRanks.push(rank);
          }
        }

        if (missingRanks.length > wildcards.length) {
          continue;
        }

        for (let idx = 0; idx < missingRanks.length; idx += 1) {
          const wildcard = wildcards[idx];
          const substituteRank = missingRanks[idx];
          if (!wildcard || substituteRank === undefined) continue;
          orderedCards.push(wildcard);
          slots.push({
            slotRank: substituteRank,
            cardId: wildcard.id,
            isWildcardSubstitute: true,
            substituteRank
          });
        }

        slots.sort((a, b) => a.slotRank - b.slotRank);
        const orderedBySlot = slots
          .map((slot) => orderedCards.find((card) => card.id === slot.cardId))
          .filter((card): card is Card => Boolean(card));

        if (orderedBySlot.length !== length) {
          continue;
        }

        const highRank = start + length - 1;
        const group: ArrangeGroup = {
          type: "straight_flush",
          cards: orderedBySlot,
          slots,
          strength: length * 1_000 + rankPower(highRank) * 10 + flushSuitWeight[suit],
          label: `同花顺(${length})`
        };

        const signature = `${keyByIds(group.cards)}#${slots
          .map((slot) => `${slot.slotRank}:${slot.cardId}`)
          .join(",")}`;
        const existing = dedup.get(signature);
        if (!existing || group.strength > existing.strength) {
          dedup.set(signature, group);
        }
      }
    }
  }

  return [...dedup.values()]
    .sort((a, b) => b.strength - a.strength || a.cards.length - b.cards.length)
    .slice(0, maxOptions);
};

const buildBombOptions = (cards: Card[], levelRank: number, maxOptions = 12): ArrangeGroup[] => {
  const wildcards = sortCardsDefault(cards.filter((card) => isWildcard(card, levelRank)));
  const nonWildcards = cards.filter((card) => !isWildcard(card, levelRank) && !isJoker(card));
  const byRank = new Map<number, Card[]>();

  for (const card of nonWildcards) {
    const bucket = byRank.get(card.rank) ?? [];
    bucket.push(card);
    byRank.set(card.rank, sortCardsDefault(bucket));
  }

  const dedup = new Map<string, ArrangeGroup>();

  for (const [rank, rankCards] of byRank.entries()) {
    const maxSize = rankCards.length + wildcards.length;
    if (maxSize < 4) continue;

    for (let size = maxSize; size >= 4; size -= 1) {
      const naturalCount = Math.min(size, rankCards.length);
      const wildcardCount = size - naturalCount;
      if (wildcardCount > wildcards.length) continue;
      if (rank >= 16 && wildcardCount > 0) continue;

      const cardsInBomb = [...rankCards.slice(0, naturalCount), ...wildcards.slice(0, wildcardCount)];
      const group: ArrangeGroup = {
        type: "bomb",
        cards: sortCardsDefault(cardsInBomb),
        strength: size * 1_000 + rankPower(rank),
        label: `炸弹(${size})`
      };

      const signature = keyByIds(group.cards);
      const existing = dedup.get(signature);
      if (!existing || group.strength > existing.strength) {
        dedup.set(signature, group);
      }
    }
  }

  return [...dedup.values()].sort((a, b) => b.strength - a.strength).slice(0, maxOptions);
};

const takeGreedyBombs = (
  cards: Card[],
  levelRank: number,
  preferredFirst: ArrangeGroup | null,
  maxGroups = 4
): ArrangeGroup[] => {
  let remain = [...cards];
  const groups: ArrangeGroup[] = [];

  if (preferredFirst) {
    const preferredSet = createUsedIdSet(preferredFirst.cards);
    const canApply = preferredFirst.cards.every((card) => remain.some((item) => item.id === card.id));
    if (canApply) {
      groups.push(preferredFirst);
      remain = removeByIds(remain, preferredSet);
    }
  }

  while (groups.length < maxGroups) {
    const option = buildBombOptions(remain, levelRank, 1)[0];
    if (!option) break;
    groups.push(option);
    remain = removeByIds(remain, createUsedIdSet(option.cards));
  }

  return groups;
};

const buildStraightPlans = (cards: Card[], levelRank: number): ArrangeGroup[][] => {
  const options = buildStraightFlushOptions(cards, levelRank, 10);
  const plans: ArrangeGroup[][] = [[]];

  for (const option of options) {
    plans.push([option]);
  }

  for (let i = 0; i < options.length; i += 1) {
    for (let j = i + 1; j < options.length; j += 1) {
      const first = options[i];
      const second = options[j];
      if (!first || !second) continue;
      if (hasOverlap(first.cards, second.cards)) continue;
      plans.push([first, second]);
      if (plans.length >= MAX_POWER_CANDIDATES * 2) {
        return plans;
      }
    }
  }

  return plans;
};

const scoreCandidate = (groups: ArrangeGroup[], normalCount: number): number => {
  const groupScore = groups.reduce((sum, group) => sum + group.strength, 0);
  return groupScore - normalCount * 2;
};

const buildStyleKey = (candidate: PowerArrangeCandidate): string => {
  const strongGroups = candidate.groups.filter((group) => group.type !== "normal");
  const firstStrong = strongGroups[0]?.type ?? "normal";

  const countMap: Record<ArrangeGroupType, number> = {
    joker_bomb: 0,
    straight_flush: 0,
    bomb: 0,
    normal: 0
  };

  for (const group of strongGroups) {
    countMap[group.type] += 1;
  }

  return [
    firstStrong,
    strongGroups.length,
    countMap.joker_bomb,
    countMap.straight_flush,
    countMap.bomb
  ].join(":");
};

const longestCommonSubsequenceLength = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;

  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i += 1) {
    const row = dp[i];
    if (!row) continue;
    for (let j = 1; j <= b.length; j += 1) {
      const diagonal = dp[i - 1]?.[j - 1] ?? 0;
      const up = dp[i - 1]?.[j] ?? 0;
      const left = row[j - 1] ?? 0;
      if (a[i - 1] === b[j - 1]) {
        row[j] = diagonal + 1;
      } else {
        row[j] = Math.max(up, left);
      }
    }
  }

  return dp[a.length]?.[b.length] ?? 0;
};

const sharedCardCount = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  return a.reduce((sum, id) => sum + (setB.has(id) ? 1 : 0), 0);
};

export const derivePowerPreference = (candidate: PowerArrangeCandidate | null | undefined): PowerArrangePreference => {
  if (!candidate) {
    return {
      signature: null,
      styleKey: null,
      orderedCardIds: []
    };
  }

  return {
    signature: candidate.signature,
    styleKey: buildStyleKey(candidate),
    orderedCardIds: candidate.cards.map((card) => card.id)
  };
};

export const selectPowerCandidate = (
  candidates: PowerArrangeCandidate[],
  preference: PowerArrangePreference | null | undefined
): PowerCandidatePickResult => {
  if (candidates.length === 0) {
    throw new Error("selectPowerCandidate requires at least one candidate.");
  }

  if (!preference) {
    return {
      candidate: candidates[0] as PowerArrangeCandidate,
      candidateIndex: 0,
      reason: "fallback"
    };
  }

  if (preference.signature) {
    const sameSignatureIndex = candidates.findIndex((candidate) => candidate.signature === preference.signature);
    if (sameSignatureIndex >= 0) {
      const candidate = candidates[sameSignatureIndex] as PowerArrangeCandidate;
      return {
        candidate,
        candidateIndex: sameSignatureIndex,
        reason: "signature"
      };
    }
  }

  if (preference.styleKey) {
    const sameStyleIndex = candidates.findIndex((candidate) => buildStyleKey(candidate) === preference.styleKey);
    if (sameStyleIndex >= 0) {
      const candidate = candidates[sameStyleIndex] as PowerArrangeCandidate;
      return {
        candidate,
        candidateIndex: sameStyleIndex,
        reason: "style"
      };
    }
  }

  if (preference.orderedCardIds.length > 0) {
    let bestIndex = -1;
    let bestLcs = -1;
    let bestShared = -1;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index] as PowerArrangeCandidate;
      const candidateIds = candidate.cards.map((card) => card.id);
      const lcs = longestCommonSubsequenceLength(preference.orderedCardIds, candidateIds);
      const shared = sharedCardCount(preference.orderedCardIds, candidateIds);

      if (lcs > bestLcs || (lcs === bestLcs && shared > bestShared)) {
        bestIndex = index;
        bestLcs = lcs;
        bestShared = shared;
      }
    }

    if (bestIndex >= 0) {
      const candidate = candidates[bestIndex] as PowerArrangeCandidate;
      return {
        candidate,
        candidateIndex: bestIndex,
        reason: "overlap"
      };
    }
  }

  return {
    candidate: candidates[0] as PowerArrangeCandidate,
    candidateIndex: 0,
    reason: "fallback"
  };
};

export const buildPowerArrangeCandidates = (cards: Card[], levelRank: number, limit = MAX_POWER_CANDIDATES): PowerArrangeCandidate[] => {
  const sorted = sortCardsDefault(cards);
  const dedup = new Map<string, PowerArrangeCandidate>();

  const jokerBomb = takeJokerBomb(sorted);
  const remainAfterJoker = jokerBomb ? removeByIds(sorted, createUsedIdSet(jokerBomb.cards)) : sorted;

  const straightPlans = buildStraightPlans(remainAfterJoker, levelRank);

  for (const straightPlan of straightPlans) {
    let remainAfterStraight = [...remainAfterJoker];
    for (const group of straightPlan) {
      remainAfterStraight = removeByIds(remainAfterStraight, createUsedIdSet(group.cards));
    }

    const bombOptions = buildBombOptions(remainAfterStraight, levelRank, 8);
    const bombPlanVariants: ArrangeGroup[][] = [];

    bombPlanVariants.push(takeGreedyBombs(remainAfterStraight, levelRank, null));

    if (bombOptions[0]) {
      bombPlanVariants.push(takeGreedyBombs(remainAfterStraight, levelRank, bombOptions[0]));
    }
    if (bombOptions[1]) {
      bombPlanVariants.push(takeGreedyBombs(remainAfterStraight, levelRank, bombOptions[1]));
    }

    bombPlanVariants.push([]);

    for (const bombPlan of bombPlanVariants) {
      const used = new Set<string>();
      const orderedGroups: ArrangeGroup[] = [];

      if (jokerBomb) {
        jokerBomb.cards.forEach((card) => used.add(card.id));
        orderedGroups.push(jokerBomb);
      }

      let valid = true;
      for (const group of [...straightPlan, ...bombPlan]) {
        if (group.cards.some((card) => used.has(card.id))) {
          valid = false;
          break;
        }
        group.cards.forEach((card) => used.add(card.id));
        orderedGroups.push(group);
      }

      if (!valid) continue;

      const normalCards = sortCardsDefault(sorted.filter((card) => !used.has(card.id)));
      if (normalCards.length > 0) {
        orderedGroups.push({
          type: "normal",
          cards: normalCards,
          strength: 0,
          label: "普通"
        });
      }

      const orderedCards = orderedGroups.flatMap((group) => group.cards);
      if (orderedCards.length !== sorted.length) {
        continue;
      }

      const slots = orderedGroups.flatMap((group) => group.slots ?? []);
      const signature = orderedCards.map((card) => card.id).join("|");
      const candidate: PowerArrangeCandidate = {
        cards: orderedCards,
        groups: orderedGroups,
        slots,
        signature,
        score: scoreCandidate(orderedGroups, normalCards.length)
      };

      const existing = dedup.get(signature);
      if (!existing || candidate.score > existing.score) {
        dedup.set(signature, candidate);
      }
    }
  }

  const candidates = [...dedup.values()].sort((a, b) => b.score - a.score);
  if (candidates.length === 0) {
    return [
      {
        cards: sorted,
        groups: [
          {
            type: "normal",
            cards: sorted,
            strength: 0,
            label: "普通"
          }
        ],
        slots: [],
        signature: sorted.map((card) => card.id).join("|"),
        score: 0
      }
    ];
  }

  return candidates.slice(0, limit);
};

export const arrangeHandByPower = (cards: Card[], levelRank: number, variantIndex = 0): ArrangeResult => {
  const candidates = buildPowerArrangeCandidates(cards, levelRank, MAX_POWER_CANDIDATES);
  const safeIndex = ((variantIndex % candidates.length) + candidates.length) % candidates.length;
  const picked = candidates[safeIndex] as PowerArrangeCandidate;

  return {
    cards: picked.cards,
    groups: picked.groups,
    candidate: picked,
    candidateCount: candidates.length,
    candidateIndex: safeIndex
  };
};

export const arrangeHand = (cards: Card[], mode: HandArrangeMode, levelRank: number, variantIndex = 0): ArrangeResult => {
  if (mode === "power") {
    return arrangeHandByPower(cards, levelRank, variantIndex);
  }

  const sorted = sortCardsDefault(cards);
  return {
    cards: sorted,
    groups: [
      {
        type: "normal",
        cards: sorted,
        strength: 0,
        label: "默认"
      }
    ],
    candidateCount: 1,
    candidateIndex: 0
  };
};

export const sortCardsForDisplay = sortCardsDefault;
