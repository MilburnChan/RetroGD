import { describe, expect, it, vi } from "vitest";
import { chooseAiAction, extractKeyMoments } from "@retro/ai-core";
import { createInitialGame, evaluateCombination } from "@retro/game-engine";
import type { Card, GameActionLog } from "@retro/shared";

const card = (id: string, suit: Card["suit"], rank: number): Card => ({
  id,
  suit,
  rank,
  display: `${suit}${rank}`
});

describe("ai decision", () => {
  it("returns a legal move action shape", () => {
    const game = createInitialGame({
      roomId: "room-ai",
      gameId: "game-ai",
      playerOrder: ["a1", "a2", "a3", "a4"],
      rng: () => 0.42
    });

    const decision = chooseAiAction(game, "a1", "normal");
    expect(["play", "pass"]).toContain(decision.action.type);
  });

  it("is less likely to pass on low single pressure", () => {
    const game = createInitialGame({
      roomId: "room-ai-low",
      gameId: "game-ai-low",
      playerOrder: ["a1", "a2", "a3", "a4"],
      rng: () => 0.31
    });

    game.phase = "turns";
    game.currentTurnIndex = 1;
    game.finishedOrder = [];
    game.passesInRow = 0;
    game.hands.a1 = [card("a1-k", "S", 13)];
    game.hands.a2 = [card("a2-5", "C", 5), card("a2-k", "D", 13)];
    game.hands.a3 = [card("a3-7", "S", 7)];
    game.hands.a4 = [card("a4-8", "D", 8)];
    game.lastPlay = {
      playerId: "a1",
      cards: [card("lead-4", "H", 4)],
      combo: evaluateCombination([card("lead-4", "H", 4)], game.levelRank),
      seq: 3
    };

    const decision = chooseAiAction(game, "a2", "normal");
    expect(decision.action.type).toBe("play");
  });

  it("does not play overlong consecutive pairs", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const game = createInitialGame({
        roomId: "room-ai-chain",
        gameId: "game-ai-chain",
        playerOrder: ["a1", "a2", "a3", "a4"],
        rng: () => 0.12
      });

      game.phase = "turns";
      game.currentTurnIndex = 1;
      game.finishedOrder = [];
      game.passesInRow = 0;
      game.hands.a1 = [card("a1-3c", "C", 3), card("a1-3d", "D", 3), card("a1-4c", "C", 4), card("a1-4d", "D", 4), card("a1-5c", "C", 5), card("a1-5d", "D", 5)];
      game.hands.a2 = [
        card("a2-10c", "C", 10),
        card("a2-10d", "D", 10),
        card("a2-jc", "C", 11),
        card("a2-jd", "D", 11),
        card("a2-qc", "C", 12),
        card("a2-qd", "D", 12),
        card("a2-kc", "C", 13),
        card("a2-kd", "D", 13),
        card("a2-ac", "C", 14),
        card("a2-ad", "D", 14)
      ];
      game.hands.a3 = [card("a3-7", "S", 7)];
      game.hands.a4 = [card("a4-8", "D", 8)];
      game.lastPlay = {
        playerId: "a1",
        cards: [...game.hands.a1],
        combo: evaluateCombination(game.hands.a1, game.levelRank),
        seq: 7
      };

      const decision = chooseAiAction(game, "a2", "normal");
      if (decision.action.type !== "play") {
        throw new Error("AI should play against chain pressure");
      }

      expect((decision.action.cardIds?.length ?? 0) <= 6).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("can use straight flush to beat pair pressure", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const game = createInitialGame({
        roomId: "room-ai-straight-flush",
        gameId: "game-ai-straight-flush",
        playerOrder: ["a1", "a2", "a3", "a4"],
        rng: () => 0.19
      });

      game.phase = "turns";
      game.currentTurnIndex = 1;
      game.finishedOrder = [];
      game.passesInRow = 0;
      game.hands.a1 = [card("a1-7c", "C", 7), card("a1-7d", "D", 7)];
      game.hands.a2 = [
        card("a2-h6", "H", 6),
        card("a2-h7", "H", 7),
        card("a2-h8", "H", 8),
        card("a2-h9", "H", 9),
        card("a2-h10", "H", 10),
        card("a2-c3", "C", 3)
      ];
      game.hands.a3 = [card("a3-4", "S", 4)];
      game.hands.a4 = [card("a4-5", "D", 5)];
      game.lastPlay = {
        playerId: "a1",
        cards: [...game.hands.a1],
        combo: evaluateCombination(game.hands.a1, game.levelRank),
        seq: 8
      };

      const decision = chooseAiAction(game, "a2", "normal");
      expect(decision.action.type).toBe("play");

      const picked = game.hands.a2.filter((item) => (decision.action.cardIds ?? []).includes(item.id));
      const combo = evaluateCombination(picked, game.levelRank);
      expect(combo.type).toBe("straight_flush");
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("key moments", () => {
  it("selects top impacts", () => {
    const logs: GameActionLog[] = [
      {
        gameId: "g1",
        seq: 1,
        playerId: "p1",
        type: "play",
        cardIds: ["c1"],
        reasonCode: "play_single",
        scoreDelta: 1,
        createdAt: new Date().toISOString()
      },
      {
        gameId: "g1",
        seq: 2,
        playerId: "p2",
        type: "play",
        cardIds: ["c2", "c3", "c4", "c5"],
        reasonCode: "play_bomb",
        scoreDelta: 9,
        createdAt: new Date().toISOString()
      }
    ];

    const key = extractKeyMoments(logs, 1);
    expect(key.length).toBe(1);
    expect(key[0]?.seq).toBe(2);
  });
});
