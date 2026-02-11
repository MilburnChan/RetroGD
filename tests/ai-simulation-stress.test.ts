import { describe, expect, it, vi } from "vitest";
import { chooseAiAction } from "@retro/ai-core";
import {
  applyPlayerAction,
  createInitialGame,
  evaluateCombinationByRule,
  getCurrentPlayerId,
  rankPower
} from "@retro/game-engine";
import type { AiDifficulty, Card, GameState, PlayerActionInput } from "@retro/shared";

const TOTAL_GAMES = 1000;
const MAX_STEPS_PER_GAME = 420;
const MAX_CONSECUTIVE_PASSES = 3;

const makeSeededRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const pickMaxCardId = (hand: Card[]): string => {
  if (hand.length === 0) {
    throw new Error("Cannot pick max card from empty hand.");
  }

  let best = hand[0] as Card;
  for (const card of hand.slice(1)) {
    const powerDiff = rankPower(card.rank) - rankPower(best.rank);
    if (powerDiff > 0 || (powerDiff === 0 && card.id < best.id)) {
      best = card;
    }
  }

  return best.id;
};

const validateTurnAction = (state: GameState, playerId: string, action: PlayerActionInput): void => {
  if (action.type === "pass") {
    if (!state.lastPlay || state.lastPlay.playerId === playerId) {
      throw new Error("AI chose invalid pass action.");
    }
    return;
  }

  if (action.type !== "play") {
    throw new Error(`Unexpected action type during turns: ${action.type}`);
  }

  const cardIds = action.cardIds ?? [];
  if (cardIds.length === 0) {
    throw new Error("AI play action has empty cardIds.");
  }

  const hand = state.hands[playerId] ?? [];
  const handLookup = new Map(hand.map((card) => [card.id, card]));
  const selected = cardIds.map((id) => handLookup.get(id)).filter((card): card is Card => Boolean(card));
  if (selected.length !== cardIds.length) {
    throw new Error("AI selected cards that are not in current hand.");
  }

  const combo = evaluateCombinationByRule(selected, {
    levelRank: state.ruleMeta.levelRank,
    wildcardEnabled: state.ruleMeta.wildcard.enabled
  });
  if (combo.type === "invalid") {
    throw new Error("AI produced invalid combination.");
  }

  if ((combo.type === "consecutive_pairs" || combo.type === "steel") && combo.length > 6) {
    throw new Error(`AI produced overlong ${combo.type}: ${combo.length}`);
  }
};

const buildAutoAction = (
  state: GameState,
  difficulty: AiDifficulty
): { playerId: string; action: PlayerActionInput } => {
  if (state.phase === "tribute") {
    const pending = state.pendingActions[0];
    if (!pending) {
      throw new Error("Missing pending tribute action.");
    }

    const hand = state.hands[pending.playerId] ?? [];
    if (hand.length === 0) {
      throw new Error("Tribute player has empty hand.");
    }

    const cardId = pending.action === "tribute_give" ? pickMaxCardId(hand) : (hand[0] as Card).id;
    return {
      playerId: pending.playerId,
      action: { type: pending.action, cardIds: [cardId] }
    };
  }

  if (state.phase !== "turns") {
    throw new Error(`Unexpected phase in AI simulation: ${state.phase}`);
  }

  const playerId = getCurrentPlayerId(state);
  const decision = chooseAiAction(state, playerId, difficulty);
  validateTurnAction(state, playerId, decision.action);
  return { playerId, action: decision.action };
};

describe("ai simulation stress", () => {
  it(
    "replays 1000 seeded games without deadlock or abnormal pass streaks",
    () => {
      const jitterRng = makeSeededRng(0x20260211);
      const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => jitterRng());

      try {
        for (let gameIndex = 0; gameIndex < TOTAL_GAMES; gameIndex += 1) {
          const seed = 10_000 + gameIndex * 97;
          const gameRng = makeSeededRng(seed);

          let state = createInitialGame({
            roomId: `stress-room-${gameIndex}`,
            gameId: `stress-game-${gameIndex}`,
            playerOrder: ["a1", "a2", "a3", "a4"],
            rng: gameRng
          });

          const targetRoundNo = state.match.roundNo + 1;
          let steps = 0;
          let consecutivePasses = 0;

          while (state.match.roundNo < targetRoundNo && steps < MAX_STEPS_PER_GAME) {
            const previousSeq = state.actionSeq;
            const { playerId, action } = buildAutoAction(state, "normal");
            const result = applyPlayerAction(state, playerId, action);
            state = result.state;
            steps += 1;

            expect(
              state.actionSeq,
              `actionSeq did not advance at gameIndex=${gameIndex}, seed=${seed}, step=${steps}`
            ).toBe(previousSeq + 1);

            if (result.log.type === "pass") {
              consecutivePasses += 1;
              expect(
                consecutivePasses,
                `abnormal pass streak at gameIndex=${gameIndex}, seed=${seed}, step=${steps}, reason=${result.log.reasonCode}`
              ).toBeLessThanOrEqual(MAX_CONSECUTIVE_PASSES);
            } else {
              consecutivePasses = 0;
            }
          }

          expect(
            state.match.roundNo,
            `round did not advance at gameIndex=${gameIndex}, seed=${seed}, steps=${steps}`
          ).toBeGreaterThanOrEqual(targetRoundNo);
        }
      } finally {
        randomSpy.mockRestore();
      }
    },
    90_000
  );
});
