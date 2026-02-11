import type {
  Card,
  CardCombination,
  GameActionLog,
  GameState,
  MatchState,
  PendingAction,
  PlayerActionInput,
  RoundResult
} from "@retro/shared";
import { createDoubleDeck, dealToFourPlayers, rankPower, shuffleCards, sortCardsAsc } from "./cards";
import { canBeat, evaluateCombinationByRule } from "./combinations";
import { RuleOptions, isBlackJoker, isRedJoker, isWildcard } from "./rules/wildcard";
import {
  applyLevelUpgrade,
  buildPendingTribute,
  hasDoubleJokers,
  nextLevelRankByWinner,
  pickMaxCard,
  resolveTributeParticipants,
  resolveWinnerTeamByRound,
  settleRoundResult,
  teamForSeatIndex
} from "./rules/round-flow";

export interface LegalMove {
  type: "play" | "pass";
  cards: Card[];
  combo: CardCombination | null;
}

export interface ApplyActionResult {
  state: GameState;
  log: GameActionLog;
}

const MAX_CONSECUTIVE_PAIRS_CARDS = 6;
const MAX_STEEL_CARDS = 6;
const MAX_CONSECUTIVE_PAIRS_CHAIN = MAX_CONSECUTIVE_PAIRS_CARDS / 2;
const MAX_STEEL_CHAIN = MAX_STEEL_CARDS / 3;

const nowIso = (): string => new Date().toISOString();

const initialMatchState = (levelRank: number): MatchState => ({
  teamLevel: {
    team0: levelRank,
    team1: levelRank
  },
  roundNo: 1,
  lastRoundResult: null,
  pendingTribute: null,
  antiTributeTriggered: false
});

const cloneState = (state: GameState): GameState => {
  return {
    ...state,
    hands: Object.fromEntries(Object.entries(state.hands).map(([playerId, cards]) => [playerId, [...cards]])),
    finishedOrder: [...state.finishedOrder],
    pendingActions: [...state.pendingActions],
    match: {
      ...state.match,
      teamLevel: { ...state.match.teamLevel },
      lastRoundResult: state.match.lastRoundResult ? { ...state.match.lastRoundResult, finishOrder: [...state.match.lastRoundResult.finishOrder] } : null,
      pendingTribute: state.match.pendingTribute
        ? {
            ...state.match.pendingTribute,
            givenCard: state.match.pendingTribute.givenCard ? { ...state.match.pendingTribute.givenCard } : undefined,
            returnedCard: state.match.pendingTribute.returnedCard ? { ...state.match.pendingTribute.returnedCard } : undefined
          }
        : null
    },
    ruleMeta: {
      ...state.ruleMeta,
      wildcard: { ...state.ruleMeta.wildcard }
    },
    lastPlay: state.lastPlay
      ? {
          ...state.lastPlay,
          cards: [...state.lastPlay.cards],
          combo: { ...state.lastPlay.combo }
        }
      : null
  };
};

const activePlayerIds = (state: GameState): string[] => {
  return state.playerOrder.filter((playerId) => !state.finishedOrder.includes(playerId));
};

const nextActiveTurnIndex = (state: GameState, fromIndex: number): number => {
  for (let offset = 1; offset <= state.playerOrder.length; offset += 1) {
    const nextIndex = (fromIndex + offset) % state.playerOrder.length;
    const playerId = state.playerOrder[nextIndex];
    if (playerId && !state.finishedOrder.includes(playerId)) {
      return nextIndex;
    }
  }
  return fromIndex;
};

const scoreForCombo = (combo: CardCombination, remainCards: number): number => {
  const baseMap: Record<string, number> = {
    single: 1,
    pair: 2,
    triple: 4,
    triple_with_pair: 6,
    straight: 5,
    straight_flush: 12,
    consecutive_pairs: 7,
    steel: 9,
    bomb: 10,
    joker_bomb: 15,
    invalid: 0
  };

  const base = baseMap[combo.type] ?? 0;
  return base + Math.max(0, 27 - remainCards);
};

const ruleOptionsFromState = (state: GameState): RuleOptions => ({
  levelRank: state.ruleMeta.levelRank,
  wildcardEnabled: state.ruleMeta.wildcard.enabled
});

const keyByCardIds = (cardIds: string[]): string => {
  return [...cardIds].sort().join("|");
};

const normalizeRanks = (ranks: number[] | undefined): string => {
  return [...(ranks ?? [])].sort((a, b) => a - b).join(",");
};

const comboEquivalent = (a: CardCombination, b: CardCombination): boolean => {
  return (
    a.type === b.type &&
    a.length === b.length &&
    a.primaryRank === b.primaryRank &&
    (a.chainLength ?? 0) === (b.chainLength ?? 0) &&
    normalizeRanks(a.kickerRanks) === normalizeRanks(b.kickerRanks) &&
    normalizeRanks(a.effectiveRanks) === normalizeRanks(b.effectiveRanks)
  );
};

const cardsByIds = (hand: Card[], cardIds: string[]): Card[] => {
  const unique = new Set(cardIds);
  if (unique.size !== cardIds.length) {
    throw new Error("Duplicate card IDs are not allowed.");
  }

  const lookup = new Map(hand.map((card) => [card.id, card]));
  const picked = cardIds.map((id) => lookup.get(id)).filter((card): card is Card => Boolean(card));
  return sortCardsAsc(picked);
};

const ensureValidSelectedCards = (hand: Card[], cardIds: string[]): Card[] => {
  const cards = cardsByIds(hand, cardIds);
  if (cards.length !== cardIds.length) {
    throw new Error("Selected cards are not in hand.");
  }
  return cards;
};

const addCandidate = (collector: Map<string, Card[]>, cards: Card[]): void => {
  if (cards.length === 0) return;
  collector.set(
    keyByCardIds(cards.map((card) => card.id)),
    sortCardsAsc(cards)
  );
};

const takeN = (cards: Card[], count: number): Card[] | null => {
  if (cards.length < count) return null;
  return cards.slice(0, count);
};

const buildStraightLikeCandidate = (
  byRank: Map<number, Card[]>,
  wildcards: Card[],
  start: number,
  chainLength: number,
  unit: 1 | 2 | 3
): Card[] | null => {
  const selected: Card[] = [];
  let wildcardUsed = 0;

  for (let rank = start; rank < start + chainLength; rank += 1) {
    const bucket = byRank.get(rank) ?? [];
    const take = Math.min(bucket.length, unit);
    selected.push(...bucket.slice(0, take));
    const missing = unit - take;

    if (missing > 0) {
      if (wildcardUsed + missing > wildcards.length) {
        return null;
      }
      selected.push(...wildcards.slice(wildcardUsed, wildcardUsed + missing));
      wildcardUsed += missing;
    }
  }

  return selected;
};

const buildStraightFlushCandidate = (
  bySuitRank: Map<"S" | "H" | "C" | "D", Map<number, Card[]>>,
  wildcards: Card[],
  suit: "S" | "H" | "C" | "D",
  start: number
): Card[] | null => {
  const selected: Card[] = [];
  let wildcardUsed = 0;
  const suitBucket = bySuitRank.get(suit);
  if (!suitBucket) return null;

  for (let rank = start; rank < start + 5; rank += 1) {
    const bucket = suitBucket.get(rank) ?? [];
    const card = bucket[0];
    if (card) {
      selected.push(card);
      continue;
    }

    const wildcard = wildcards[wildcardUsed];
    if (!wildcard) {
      return null;
    }

    selected.push(wildcard);
    wildcardUsed += 1;
  }

  return selected;
};

const candidatePlaysFromHand = (hand: Card[], options: RuleOptions): Card[][] => {
  const collector = new Map<string, Card[]>();
  const sorted = sortCardsAsc(hand);

  for (const card of sorted) {
    addCandidate(collector, [card]);
  }

  const wildcards = sorted.filter((card) => isWildcard(card, options));
  const nonWildcards = sorted.filter((card) => !isWildcard(card, options));

  const byRank = new Map<number, Card[]>();
  const bySuitRank = new Map<"S" | "H" | "C" | "D", Map<number, Card[]>>([
    ["S", new Map()],
    ["H", new Map()],
    ["C", new Map()],
    ["D", new Map()]
  ]);

  for (const card of nonWildcards) {
    const bucket = byRank.get(card.rank) ?? [];
    bucket.push(card);
    byRank.set(card.rank, bucket);

    if (card.suit === "S" || card.suit === "H" || card.suit === "C" || card.suit === "D") {
      const suitBucket = bySuitRank.get(card.suit);
      if (suitBucket) {
        const rankBucket = suitBucket.get(card.rank) ?? [];
        rankBucket.push(card);
        suitBucket.set(card.rank, rankBucket);
      }
    }
  }

  for (let rank = 2; rank <= 17; rank += 1) {
    const bucket = byRank.get(rank) ?? [];

    for (let need = 2; need <= 8; need += 1) {
      const natural = Math.min(bucket.length, need);
      const missing = need - natural;
      if (missing < 0 || missing > wildcards.length) continue;

      if (rank >= 16 && missing > 0) continue;

      const cards = [...bucket.slice(0, natural), ...wildcards.slice(0, missing)];
      addCandidate(collector, cards);
    }
  }

  for (let tripleRank = 2; tripleRank <= 17; tripleRank += 1) {
    for (let pairRank = 2; pairRank <= 17; pairRank += 1) {
      if (tripleRank === pairRank) continue;

      const tripleBucket = byRank.get(tripleRank) ?? [];
      const pairBucket = byRank.get(pairRank) ?? [];

      const tripleNatural = Math.min(3, tripleBucket.length);
      const pairNatural = Math.min(2, pairBucket.length);

      const tripleMissing = 3 - tripleNatural;
      const pairMissing = 2 - pairNatural;
      const totalMissing = tripleMissing + pairMissing;

      if (totalMissing > wildcards.length) continue;
      if (tripleRank >= 16 && tripleMissing > 0) continue;
      if (pairRank >= 16 && pairMissing > 0) continue;

      const cards: Card[] = [];
      cards.push(...tripleBucket.slice(0, tripleNatural));
      cards.push(...pairBucket.slice(0, pairNatural));
      cards.push(...wildcards.slice(0, tripleMissing));
      cards.push(...wildcards.slice(tripleMissing, tripleMissing + pairMissing));

      addCandidate(collector, cards);
    }
  }

  for (let start = 3; start + 5 - 1 <= 14; start += 1) {
    const straight = buildStraightLikeCandidate(byRank, wildcards, start, 5, 1);
    if (straight) addCandidate(collector, straight);
  }

  for (const suit of ["S", "H", "C", "D"] as const) {
    for (let start = 3; start + 5 - 1 <= 14; start += 1) {
      const straightFlush = buildStraightFlushCandidate(bySuitRank, wildcards, suit, start);
      if (straightFlush) addCandidate(collector, straightFlush);
    }
  }

  for (let chainLength = 3; chainLength <= MAX_CONSECUTIVE_PAIRS_CHAIN; chainLength += 1) {
    for (let start = 3; start + chainLength - 1 <= 14; start += 1) {
      const consecutivePairs = buildStraightLikeCandidate(byRank, wildcards, start, chainLength, 2);
      if (consecutivePairs) addCandidate(collector, consecutivePairs);

      if (chainLength > MAX_STEEL_CHAIN) {
        continue;
      }

      const steel = buildStraightLikeCandidate(byRank, wildcards, start, chainLength, 3);
      if (steel) addCandidate(collector, steel);
    }
  }

  const blackJokers = nonWildcards.filter((card) => isBlackJoker(card));
  const redJokers = nonWildcards.filter((card) => isRedJoker(card));
  if (blackJokers.length >= 2 && redJokers.length >= 2) {
    addCandidate(collector, [...blackJokers.slice(0, 2), ...redJokers.slice(0, 2)]);
  }

  return [...collector.values()];
};

const dealRoundHands = (playerOrder: string[], rng?: () => number): Record<string, Card[]> => {
  const deck = shuffleCards(createDoubleDeck(), rng);
  const handsList = dealToFourPlayers(deck);

  const hands: Record<string, Card[]> = {};
  playerOrder.forEach((playerId, index) => {
    hands[playerId] = handsList[index] ?? [];
  });

  return hands;
};

const roundStarterIndexFromState = (state: GameState): number => {
  const starterPlayerId = state.match.lastRoundResult?.finishOrder[0] ?? state.playerOrder[0];
  const starterIndex = starterPlayerId ? state.playerOrder.indexOf(starterPlayerId) : 0;
  return starterIndex >= 0 ? starterIndex : 0;
};

const beginNextRound = (state: GameState, rng?: () => number): GameState => {
  const next = cloneState(state);
  next.match.roundNo += 1;
  next.match.pendingTribute = null;
  next.match.antiTributeTriggered = false;

  const starterIndex = roundStarterIndexFromState(next);

  next.hands = dealRoundHands(next.playerOrder, rng);
  next.phase = "turns";
  next.lastPlay = null;
  next.passesInRow = 0;
  next.finishedOrder = [];
  next.winnerTeam = null;
  next.pendingActions = [];
  next.currentTurnIndex = starterIndex >= 0 ? starterIndex : 0;
  next.updatedAt = nowIso();

  return next;
};

const resolvePendingAction = (state: GameState, playerId: string): PendingAction | null => {
  return state.pendingActions.find((action) => action.playerId === playerId) ?? null;
};

const ensureMaxCardTribute = (hand: Card[], selected: Card): void => {
  const maxCard = pickMaxCard(hand);
  if (!maxCard) {
    throw new Error("No card available for tribute.");
  }

  if (rankPower(selected.rank) !== rankPower(maxCard.rank)) {
    throw new Error("Tribute must give the maximum card.");
  }
};

const settleRoundAndPrepareNextPhase = (state: GameState): GameState => {
  const next = cloneState(state);
  const winnerTeam = resolveWinnerTeamByRound(next);

  if (winnerTeam === null) {
    return next;
  }

  next.winnerTeam = winnerTeam;
  next.phase = "game-finish";

  const result: RoundResult = settleRoundResult(next, winnerTeam);
  next.match = applyLevelUpgrade(next.match, result);

  const newLevelRank = nextLevelRankByWinner(next.match, winnerTeam);
  next.levelRank = newLevelRank;
  next.ruleMeta.levelRank = newLevelRank;
  next.ruleMeta.wildcard.rank = newLevelRank;

  const tributeParticipants = resolveTributeParticipants(next, winnerTeam);
  if (!tributeParticipants) {
    return beginNextRound(next);
  }

  const donorHand = next.hands[tributeParticipants.donorPlayerId] ?? [];
  const antiTributeTriggered = hasDoubleJokers(donorHand);
  const roundStarted = beginNextRound(next);
  roundStarted.match.antiTributeTriggered = antiTributeTriggered;

  if (antiTributeTriggered) {
    return roundStarted;
  }

  roundStarted.phase = "tribute";
  roundStarted.match.pendingTribute = buildPendingTribute(
    tributeParticipants.donorPlayerId,
    tributeParticipants.receiverPlayerId
  );
  roundStarted.pendingActions = [{ playerId: tributeParticipants.donorPlayerId, action: "tribute_give" }];

  const donorIndex = roundStarted.playerOrder.indexOf(tributeParticipants.donorPlayerId);
  if (donorIndex >= 0) {
    roundStarted.currentTurnIndex = donorIndex;
  }

  return roundStarted;
};

export const createInitialGame = (params: {
  roomId: string;
  gameId: string;
  playerOrder: string[];
  levelRank?: number;
  rng?: () => number;
}): GameState => {
  const { roomId, gameId, playerOrder, levelRank = 2, rng } = params;
  if (playerOrder.length !== 4) {
    throw new Error("Guandan requires exactly 4 players.");
  }

  const now = nowIso();
  return {
    id: gameId,
    roomId,
    phase: "turns",
    levelRank,
    playerOrder,
    hands: dealRoundHands(playerOrder, rng),
    currentTurnIndex: 0,
    lastPlay: null,
    passesInRow: 0,
    finishedOrder: [],
    winnerTeam: null,
    actionSeq: 0,
    match: initialMatchState(levelRank),
    pendingActions: [],
    ruleMeta: {
      levelRank,
      wildcard: {
        enabled: true,
        suit: "H",
        rank: levelRank
      },
      comparePolicy: "same_type_same_length"
    },
    createdAt: now,
    updatedAt: now
  };
};

export const getCurrentPlayerId = (state: GameState): string => {
  const player = state.playerOrder[state.currentTurnIndex];
  if (!player) throw new Error("Invalid turn index.");
  return player;
};

export const getLegalMoves = (state: GameState, playerId: string): LegalMove[] => {
  if (state.phase !== "turns") return [];
  if (getCurrentPlayerId(state) !== playerId) return [];
  if (state.finishedOrder.includes(playerId)) return [];

  const hand = state.hands[playerId] ?? [];
  const options = ruleOptionsFromState(state);
  const candidates = candidatePlaysFromHand(hand, options)
    .map((cards) => ({ cards, combo: evaluateCombinationByRule(cards, options) }))
    .filter((item) => item.combo.type !== "invalid");

  let playable = candidates;
  if (state.lastPlay && state.lastPlay.playerId !== playerId) {
    playable = candidates.filter((item) => canBeat(item.combo, state.lastPlay?.combo ?? null));
  }

  const moves: LegalMove[] = playable.map((item) => ({
    type: "play",
    cards: sortCardsAsc(item.cards),
    combo: item.combo
  }));

  if (state.lastPlay && state.lastPlay.playerId !== playerId) {
    moves.push({ type: "pass", cards: [], combo: null });
  }

  return moves;
};

const removeCardsByIds = (hand: Card[], cardIds: string[]): Card[] => {
  const removed = new Set(cardIds);
  return hand.filter((card) => !removed.has(card.id));
};

const handleTributeAction = (state: GameState, playerId: string, input: PlayerActionInput): ApplyActionResult => {
  const next = cloneState(state);

  if (next.phase !== "tribute") {
    throw new Error("Tribute action is only allowed in tribute phase.");
  }

  const pending = resolvePendingAction(next, playerId);
  if (!pending) {
    throw new Error("No pending tribute action for this player.");
  }

  const cardIds = input.cardIds ?? [];
  if (cardIds.length !== 1) {
    throw new Error("Tribute action requires exactly one card.");
  }

  const hand = next.hands[playerId] ?? [];
  const selectedCards = ensureValidSelectedCards(hand, cardIds);
  const selectedCard = selectedCards[0] as Card;

  let reasonCode = "tribute";

  if (pending.action === "tribute_give" && input.type === "tribute_give") {
    const tribute = next.match.pendingTribute;
    if (!tribute || tribute.donorPlayerId !== playerId) {
      throw new Error("Invalid tribute giver.");
    }

    ensureMaxCardTribute(hand, selectedCard);

    next.hands[playerId] = removeCardsByIds(hand, [selectedCard.id]);
    next.hands[tribute.receiverPlayerId] = sortCardsAsc([...(next.hands[tribute.receiverPlayerId] ?? []), selectedCard]);

    next.match.pendingTribute = {
      ...tribute,
      status: "pending_return",
      givenCard: selectedCard
    };

    next.pendingActions = [{ playerId: tribute.receiverPlayerId, action: "tribute_return" }];
    const receiverIndex = next.playerOrder.indexOf(tribute.receiverPlayerId);
    if (receiverIndex >= 0) {
      next.currentTurnIndex = receiverIndex;
    }

    reasonCode = "tribute_give";
  } else if (pending.action === "tribute_return" && input.type === "tribute_return") {
    const tribute = next.match.pendingTribute;
    if (!tribute || tribute.receiverPlayerId !== playerId) {
      throw new Error("Invalid tribute receiver.");
    }

    next.hands[playerId] = removeCardsByIds(hand, [selectedCard.id]);
    next.hands[tribute.donorPlayerId] = sortCardsAsc([...(next.hands[tribute.donorPlayerId] ?? []), selectedCard]);

    next.match.pendingTribute = {
      ...tribute,
      status: "completed",
      returnedCard: selectedCard
    };

    next.pendingActions = [];
    next.phase = "turns";
    next.lastPlay = null;
    next.passesInRow = 0;
    next.currentTurnIndex = roundStarterIndexFromState(next);
    next.match.pendingTribute = null;
    reasonCode = "tribute_return";

    const log: GameActionLog = {
      gameId: next.id,
      seq: next.actionSeq + 1,
      playerId,
      type: input.type,
      cardIds: [selectedCard.id],
      reasonCode,
      scoreDelta: 0,
      createdAt: nowIso()
    };

    next.actionSeq += 1;
    next.updatedAt = log.createdAt;

    return { state: next, log };
  } else {
    throw new Error("Unexpected tribute action type.");
  }

  next.actionSeq += 1;
  next.updatedAt = nowIso();

  const log: GameActionLog = {
    gameId: next.id,
    seq: next.actionSeq,
    playerId,
    type: input.type,
    cardIds,
    reasonCode,
    scoreDelta: 0,
    createdAt: next.updatedAt
  };

  return { state: next, log };
};

export const applyPlayerAction = (
  state: GameState,
  playerId: string,
  input: PlayerActionInput
): ApplyActionResult => {
  if (input.type === "tribute_give" || input.type === "tribute_return") {
    return handleTributeAction(state, playerId, input);
  }

  const next = cloneState(state);

  if (next.phase !== "turns") {
    throw new Error("Current phase does not allow play/pass actions.");
  }

  const current = getCurrentPlayerId(next);
  if (current !== playerId) {
    throw new Error("Not your turn.");
  }

  const hand = next.hands[playerId] ?? [];
  let reasonCode = "noop";
  let scoreDelta = 0;
  let actionCardIds: string[] = [];

  if (input.type === "play") {
    const cardIds = input.cardIds ?? [];
    if (cardIds.length === 0) {
      throw new Error("Play action requires cardIds.");
    }

    const cards = ensureValidSelectedCards(hand, cardIds);
    const combo = evaluateCombinationByRule(cards, ruleOptionsFromState(next));
    if (combo.type === "invalid") {
      throw new Error("Invalid card combination.");
    }

    const legalEquivalentExists = getLegalMoves(next, playerId)
      .filter((move) => move.type === "play" && move.combo)
      .some((move) => comboEquivalent(combo, move.combo as CardCombination));

    if (!legalEquivalentExists) {
      throw new Error("Selected cards are not a legal move.");
    }

    if (next.lastPlay && next.lastPlay.playerId !== playerId && !canBeat(combo, next.lastPlay.combo)) {
      throw new Error("Current play does not beat previous combination.");
    }

    next.hands[playerId] = removeCardsByIds(hand, cardIds);
    actionCardIds = [...cardIds];

    next.lastPlay = {
      playerId,
      cards,
      combo,
      seq: next.actionSeq + 1
    };
    next.passesInRow = 0;
    reasonCode = `play_${combo.type}`;
    scoreDelta = scoreForCombo(combo, next.hands[playerId].length);

    if (next.hands[playerId].length === 0 && !next.finishedOrder.includes(playerId)) {
      next.finishedOrder.push(playerId);
      reasonCode = `${reasonCode}_finish`;
    }

    const winnerTeam = resolveWinnerTeamByRound(next);
    let progressed = next;

    if (winnerTeam === null) {
      progressed.currentTurnIndex = nextActiveTurnIndex(progressed, progressed.currentTurnIndex);
    } else {
      progressed = settleRoundAndPrepareNextPhase(next);
    }

    progressed.actionSeq += 1;
    progressed.updatedAt = nowIso();

    const log: GameActionLog = {
      gameId: progressed.id,
      seq: progressed.actionSeq,
      playerId,
      type: input.type,
      cardIds: actionCardIds,
      reasonCode,
      scoreDelta,
      createdAt: progressed.updatedAt
    };

    return { state: progressed, log };
  }

  if (input.type === "pass") {
    if (!next.lastPlay) {
      throw new Error("Cannot pass without previous play.");
    }
    if (next.lastPlay.playerId === playerId) {
      throw new Error("Leader cannot pass immediately.");
    }

    next.passesInRow += 1;
    reasonCode = "pass";
    scoreDelta = -1;

    const activeCount = activePlayerIds(next).length;
    if (next.passesInRow >= Math.max(activeCount - 1, 1)) {
      const leaderIndex = next.playerOrder.indexOf(next.lastPlay.playerId);
      if (leaderIndex >= 0) {
        const leaderPlayerId = next.playerOrder[leaderIndex];
        const leaderFinished =
          !leaderPlayerId ||
          next.finishedOrder.includes(leaderPlayerId) ||
          (next.hands[leaderPlayerId]?.length ?? 0) === 0;

        next.currentTurnIndex = leaderFinished ? nextActiveTurnIndex(next, leaderIndex) : leaderIndex;
      }
      next.lastPlay = null;
      next.passesInRow = 0;
      reasonCode = "trick_reset";
    } else {
      next.currentTurnIndex = nextActiveTurnIndex(next, next.currentTurnIndex);
    }

    next.actionSeq += 1;
    next.updatedAt = nowIso();

    const log: GameActionLog = {
      gameId: next.id,
      seq: next.actionSeq,
      playerId,
      type: input.type,
      cardIds: [],
      reasonCode,
      scoreDelta,
      createdAt: next.updatedAt
    };

    return { state: next, log };
  }

  if (input.type === "toggle_auto") {
    next.actionSeq += 1;
    next.updatedAt = nowIso();

    const log: GameActionLog = {
      gameId: next.id,
      seq: next.actionSeq,
      playerId,
      type: input.type,
      cardIds: [],
      reasonCode: input.enabled ? "auto_enabled" : "auto_disabled",
      scoreDelta: 0,
      createdAt: next.updatedAt
    };

    return { state: next, log };
  }

  throw new Error("Unsupported action type.");
};

export const currentPendingActionForPlayer = (state: GameState, playerId: string): PendingAction | null => {
  return resolvePendingAction(state, playerId);
};

export const currentRoundTeamLevel = (state: GameState, team: number): number => {
  return team === 0 ? state.match.teamLevel.team0 : state.match.teamLevel.team1;
};

export const playerTeam = (state: GameState, playerId: string): number | null => {
  const seat = state.playerOrder.indexOf(playerId);
  if (seat < 0) return null;
  return teamForSeatIndex(seat);
};
