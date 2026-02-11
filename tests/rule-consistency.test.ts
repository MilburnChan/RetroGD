import { describe, expect, it } from "vitest";
import {
  applyPlayerAction,
  createInitialGame,
  evaluateCombination,
  getLegalMoves
} from "@retro/game-engine";

describe("rule consistency", () => {
  it("all enumerated legal play moves are evaluatable and executable", () => {
    const game = createInitialGame({
      roomId: "r-consistency-1",
      gameId: "g-consistency-1",
      playerOrder: ["p1", "p2", "p3", "p4"],
      rng: () => 0.37
    });

    const playerId = game.playerOrder[game.currentTurnIndex] as string;
    const moves = getLegalMoves(game, playerId).filter((move) => move.type === "play");

    expect(moves.length > 0).toBe(true);

    for (const move of moves) {
      const combo = evaluateCombination(move.cards, game.levelRank);
      expect(combo.type).not.toBe("invalid");

      expect(() =>
        applyPlayerAction(game, playerId, {
          type: "play",
          cardIds: move.cards.map((card) => card.id)
        })
      ).not.toThrow();
    }
  });

  it("enumerated straights are fixed to 5 cards and can include straight flush", () => {
    const game = createInitialGame({
      roomId: "r-consistency-2",
      gameId: "g-consistency-2",
      playerOrder: ["p1", "p2", "p3", "p4"],
      rng: () => 0.44
    });

    game.phase = "turns";
    game.currentTurnIndex = 0;
    game.lastPlay = null;
    game.passesInRow = 0;
    game.finishedOrder = [];
    game.hands.p1 = [
      { id: "h6", suit: "H", rank: 6, display: "H6" },
      { id: "h7", suit: "H", rank: 7, display: "H7" },
      { id: "h8", suit: "H", rank: 8, display: "H8" },
      { id: "h9", suit: "H", rank: 9, display: "H9" },
      { id: "h10", suit: "H", rank: 10, display: "H10" },
      { id: "s4", suit: "S", rank: 4, display: "S4" }
    ];

    const moves = getLegalMoves(game, "p1").filter((move) => move.type === "play");
    expect(moves.filter((move) => move.combo?.type === "straight").every((move) => move.combo?.length === 5)).toBe(true);
    expect(moves.some((move) => move.combo?.type === "straight_flush")).toBe(true);
  });
});
