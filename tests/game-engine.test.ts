import { describe, expect, it } from "vitest";
import { applyPlayerAction, canBeat, createInitialGame, evaluateCombination, getLegalMoves } from "@retro/game-engine";
import type { Card } from "@retro/shared";

const card = (id: string, suit: Card["suit"], rank: number): Card => ({
  id,
  suit,
  rank,
  display: `${suit}${rank}`
});

describe("combination rules", () => {
  it("recognizes steel: 333444", () => {
    const combo = evaluateCombination(
      [card("1", "C", 3), card("2", "D", 3), card("3", "S", 3), card("4", "C", 4), card("5", "D", 4), card("6", "S", 4)],
      2
    );

    expect(combo.type).toBe("steel");
    expect(combo.chainLength).toBe(2);
  });

  it("recognizes consecutive pairs", () => {
    const combo = evaluateCombination(
      [card("1", "C", 3), card("2", "D", 3), card("3", "C", 4), card("4", "D", 4), card("5", "C", 5), card("6", "D", 5)],
      2
    );

    expect(combo.type).toBe("consecutive_pairs");
    expect(combo.chainLength).toBe(3);
  });

  it("accepts 5-card straight and rejects 6-card straight", () => {
    const straight5 = evaluateCombination(
      [card("s3", "S", 3), card("s4", "S", 4), card("d5", "D", 5), card("c6", "C", 6), card("h7", "H", 7)],
      2
    );
    const straight6 = evaluateCombination(
      [card("a3", "S", 3), card("a4", "D", 4), card("a5", "C", 5), card("a6", "H", 6), card("a7", "S", 7), card("a8", "D", 8)],
      2
    );

    expect(straight5.type).toBe("straight");
    expect(straight6.type).toBe("invalid");
  });

  it("recognizes straight flush with wildcard substitution", () => {
    const combo = evaluateCombination(
      [card("h10", "H", 10), card("hj", "H", 11), card("hq", "H", 12), card("hk", "H", 13), card("h2", "H", 2)],
      2
    );

    expect(combo.type).toBe("straight_flush");
    expect(combo.length).toBe(5);
  });

  it("rejects consecutive pairs longer than 6 cards", () => {
    const combo = evaluateCombination(
      [
        card("1", "C", 3),
        card("2", "D", 3),
        card("3", "C", 4),
        card("4", "D", 4),
        card("5", "C", 5),
        card("6", "D", 5),
        card("7", "C", 6),
        card("8", "D", 6),
        card("9", "C", 7),
        card("10", "D", 7)
      ],
      2
    );

    expect(combo.type).toBe("invalid");
  });

  it("rejects steel longer than 6 cards", () => {
    const combo = evaluateCombination(
      [
        card("1", "C", 3),
        card("2", "D", 3),
        card("3", "S", 3),
        card("4", "C", 4),
        card("5", "D", 4),
        card("6", "S", 4),
        card("7", "C", 5),
        card("8", "D", 5),
        card("9", "S", 5)
      ],
      2
    );

    expect(combo.type).toBe("invalid");
  });

  it("supports triple_with_pair using wildcard", () => {
    const combo = evaluateCombination(
      [card("1", "S", 7), card("2", "D", 7), card("3", "C", 7), card("4", "H", 6), card("5", "D", 9)],
      6
    );

    expect(combo.type).toBe("triple_with_pair");
    expect(combo.wildcardCount).toBe(1);
  });

  it("recognizes joker bomb and beats normal bomb", () => {
    const jokerBomb = evaluateCombination([card("1", "BJ", 16), card("2", "BJ", 16), card("3", "RJ", 17), card("4", "RJ", 17)], 2);
    const normalBomb = evaluateCombination([card("5", "C", 10), card("6", "D", 10), card("7", "H", 10), card("8", "S", 10)], 2);

    expect(jokerBomb.type).toBe("joker_bomb");
    expect(canBeat(jokerBomb, normalBomb)).toBe(true);
  });

  it("compares bomb by length first", () => {
    const bomb4 = evaluateCombination([card("1", "C", 8), card("2", "D", 8), card("3", "H", 8), card("4", "S", 8)], 2);
    const bomb5 = evaluateCombination([card("5", "C", 9), card("6", "D", 9), card("7", "H", 9), card("8", "S", 9), card("9", "C", 9)], 2);

    expect(canBeat(bomb5, bomb4)).toBe(true);
  });

  it("supports straight flush hierarchy against pair, 5-bomb and 6-bomb", () => {
    const straightFlush = evaluateCombination(
      [card("h6", "H", 6), card("h7", "H", 7), card("h8", "H", 8), card("h9", "H", 9), card("h10", "H", 10)],
      2
    );
    const pair7 = evaluateCombination([card("p7a", "S", 7), card("p7b", "D", 7)], 2);
    const bomb5 = evaluateCombination(
      [card("b5a", "C", 9), card("b5b", "D", 9), card("b5c", "H", 9), card("b5d", "S", 9), card("b5e", "C", 9)],
      2
    );
    const bomb6 = evaluateCombination(
      [card("b6a", "C", 10), card("b6b", "D", 10), card("b6c", "H", 10), card("b6d", "S", 10), card("b6e", "C", 10), card("b6f", "D", 10)],
      2
    );
    const jokerBomb = evaluateCombination([card("j1", "BJ", 16), card("j2", "BJ", 16), card("j3", "RJ", 17), card("j4", "RJ", 17)], 2);

    expect(canBeat(straightFlush, pair7)).toBe(true);
    expect(canBeat(straightFlush, bomb5)).toBe(true);
    expect(canBeat(straightFlush, bomb6)).toBe(false);
    expect(canBeat(jokerBomb, straightFlush)).toBe(true);
  });
});

describe("anti-cheat", () => {
  it("rejects duplicate card ids in play action", () => {
    const game = createInitialGame({
      roomId: "r1",
      gameId: "g1",
      playerOrder: ["p1", "p2", "p3", "p4"],
      rng: () => 0.5
    });

    const oneCardId = game.hands.p1?.[0]?.id;
    expect(oneCardId).toBeDefined();

    expect(() =>
      applyPlayerAction(game, "p1", {
        type: "play",
        cardIds: [oneCardId as string, oneCardId as string]
      })
    ).toThrow(/Duplicate card IDs/);
  });

  it("rejects overlong consecutive pairs in action submit", () => {
    const game = createInitialGame({
      roomId: "r-overlong",
      gameId: "g-overlong",
      playerOrder: ["p1", "p2", "p3", "p4"],
      rng: () => 0.4
    });

    game.phase = "turns";
    game.currentTurnIndex = 0;
    game.lastPlay = null;
    game.passesInRow = 0;
    game.finishedOrder = [];
    game.hands.p1 = [
      card("p1-3c", "C", 3),
      card("p1-3d", "D", 3),
      card("p1-4c", "C", 4),
      card("p1-4d", "D", 4),
      card("p1-5c", "C", 5),
      card("p1-5d", "D", 5),
      card("p1-6c", "C", 6),
      card("p1-6d", "D", 6),
      card("p1-7c", "C", 7),
      card("p1-7d", "D", 7)
    ];
    game.hands.p2 = [card("p2-a", "S", 14)];
    game.hands.p3 = [card("p3-a", "H", 14)];
    game.hands.p4 = [card("p4-a", "D", 14)];

    const cardIds = game.hands.p1.map((item) => item.id);
    expect(() =>
      applyPlayerAction(game, "p1", {
        type: "play",
        cardIds
      })
    ).toThrow(/Invalid card combination|legal move/);
  });

  it("accepts equivalent triple selection from four-of-a-kind", () => {
    const game = createInitialGame({
      roomId: "r-triple-equivalent",
      gameId: "g-triple-equivalent",
      playerOrder: ["p1", "p2", "p3", "p4"],
      rng: () => 0.21
    });

    game.phase = "turns";
    game.currentTurnIndex = 0;
    game.lastPlay = null;
    game.passesInRow = 0;
    game.finishedOrder = [];
    game.hands.p1 = [
      card("p1-4c", "C", 4),
      card("p1-4d", "D", 4),
      card("p1-4h", "H", 4),
      card("p1-4s", "S", 4),
      card("p1-9c", "C", 9)
    ];
    game.hands.p2 = [card("p2-a", "S", 14)];
    game.hands.p3 = [card("p3-a", "H", 14)];
    game.hands.p4 = [card("p4-a", "D", 14)];

    expect(() =>
      applyPlayerAction(game, "p1", {
        type: "play",
        cardIds: ["p1-4c", "p1-4d", "p1-4s"]
      })
    ).not.toThrow();
  });

  it("does not enumerate overlong chain moves in legal moves", () => {
    const game = createInitialGame({
      roomId: "r-legal",
      gameId: "g-legal",
      playerOrder: ["p1", "p2", "p3", "p4"],
      rng: () => 0.5
    });

    game.phase = "turns";
    game.currentTurnIndex = 0;
    game.lastPlay = null;
    game.passesInRow = 0;
    game.finishedOrder = [];
    game.hands.p1 = [
      card("p1-3c", "C", 3),
      card("p1-3d", "D", 3),
      card("p1-4c", "C", 4),
      card("p1-4d", "D", 4),
      card("p1-5c", "C", 5),
      card("p1-5d", "D", 5),
      card("p1-6c", "C", 6),
      card("p1-6d", "D", 6),
      card("p1-7c", "C", 7),
      card("p1-7d", "D", 7)
    ];

    const moves = getLegalMoves(game, "p1").filter((move) => move.type === "play");
    expect(
      moves.every((move) => {
        const combo = move.combo;
        if (!combo) return true;
        if (combo.type === "consecutive_pairs" || combo.type === "steel") {
          return combo.length <= 6;
        }
        if (combo.type === "straight") {
          return combo.length === 5;
        }
        return true;
      })
    ).toBe(true);
  });

  it("enumerates straight flush as legal move when available", () => {
    const game = createInitialGame({
      roomId: "r-straight-flush",
      gameId: "g-straight-flush",
      playerOrder: ["p1", "p2", "p3", "p4"],
      rng: () => 0.5
    });

    game.phase = "turns";
    game.currentTurnIndex = 0;
    game.lastPlay = null;
    game.passesInRow = 0;
    game.finishedOrder = [];
    game.hands.p1 = [
      card("h6", "H", 6),
      card("h7", "H", 7),
      card("h8", "H", 8),
      card("h9", "H", 9),
      card("h10", "H", 10),
      card("c3", "C", 3)
    ];

    const moves = getLegalMoves(game, "p1").filter((move) => move.type === "play");
    expect(moves.some((move) => move.combo?.type === "straight_flush")).toBe(true);
  });
});
