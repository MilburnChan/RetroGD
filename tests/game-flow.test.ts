import { describe, expect, it } from "vitest";
import { applyPlayerAction, createInitialGame, evaluateCombination, rankPower } from "@retro/game-engine";
import type { Card, GameState } from "@retro/shared";
import { roomService } from "../apps/web/src/server/store";

const card = (id: string, suit: Card["suit"], rank: number): Card => ({
  id,
  suit,
  rank,
  display: `${suit}${rank}`
});

const withRoundState = (game: GameState, patch: Partial<GameState>): GameState => ({
  ...game,
  ...patch
});

const pickMaxCardId = (cards: Card[]): string =>
  [...cards].sort((a, b) => rankPower(b.rank) - rankPower(a.rank) || b.id.localeCompare(a.id))[0]?.id ?? "";

describe("round flow", () => {
  it("triggers anti-tribute when donor has double jokers", () => {
    const game = createInitialGame({
      roomId: "r-flow-1",
      gameId: "g-flow-1",
      playerOrder: ["p1", "p2", "p3", "p4"],
      levelRank: 2,
      rng: () => 0.3
    });

    const state = withRoundState(game, {
      phase: "turns",
      currentTurnIndex: 0,
      finishedOrder: ["p3"],
      hands: {
        p1: [card("a1", "S", 10)],
        p2: [card("b1", "BJ", 16), card("b2", "RJ", 17), card("b3", "C", 3)],
        p3: [],
        p4: [card("d1", "C", 4)]
      }
    });

    const result = applyPlayerAction(state, "p1", {
      type: "play",
      cardIds: ["a1"]
    });

    expect(result.state.match.roundNo).toBe(2);
    expect(result.state.phase).toBe("turns");
    expect(result.state.pendingActions.length).toBe(0);
    expect(result.state.match.teamLevel.team0).toBe(5);
  });

  it("runs tribute in next dealt round and does not redeal after return", () => {
    const game = createInitialGame({
      roomId: "r-flow-2",
      gameId: "g-flow-2",
      playerOrder: ["p1", "p2", "p3", "p4"],
      levelRank: 2,
      rng: () => 0.4
    });

    const state = withRoundState(game, {
      phase: "turns",
      currentTurnIndex: 0,
      finishedOrder: ["p3"],
      hands: {
        p1: [card("a1", "S", 9)],
        p2: [card("b1", "S", 2), card("b2", "C", 6)],
        p3: [],
        p4: [card("d1", "C", 4)]
      }
    });

    const afterFinish = applyPlayerAction(state, "p1", {
      type: "play",
      cardIds: ["a1"]
    });

    expect(afterFinish.state.match.roundNo).toBe(2);
    expect(afterFinish.state.phase).toBe("tribute");
    expect(afterFinish.state.pendingActions[0]?.action).toBe("tribute_give");
    expect(afterFinish.state.pendingActions[0]?.playerId).toBe("p2");
    expect(afterFinish.state.hands.p1?.length).toBe(27);
    expect(afterFinish.state.hands.p2?.length).toBe(27);
    expect(afterFinish.state.hands.p3?.length).toBe(27);
    expect(afterFinish.state.hands.p4?.length).toBe(27);

    const donorPlayerId = afterFinish.state.pendingActions[0]?.playerId as string;
    const receiverPlayerId = afterFinish.state.match.pendingTribute?.receiverPlayerId as string;
    const donorMaxCardId = pickMaxCardId(afterFinish.state.hands[donorPlayerId] ?? []);
    expect(donorMaxCardId.length > 0).toBe(true);

    const untouchedPlayerHandIds = (afterFinish.state.hands.p4 ?? []).map((item) => item.id);

    const afterGive = applyPlayerAction(afterFinish.state, donorPlayerId, {
      type: "tribute_give",
      cardIds: [donorMaxCardId]
    });

    expect(afterGive.state.phase).toBe("tribute");
    expect(afterGive.state.pendingActions[0]?.action).toBe("tribute_return");
    expect(afterGive.state.pendingActions[0]?.playerId).toBe(receiverPlayerId);
    expect(afterGive.state.hands[donorPlayerId]?.length).toBe(26);
    expect(afterGive.state.hands[receiverPlayerId]?.length).toBe(28);

    const receivedCardId = afterGive.state.hands[receiverPlayerId]?.[0]?.id;
    expect(receivedCardId).toBeDefined();

    const afterReturn = applyPlayerAction(afterGive.state, receiverPlayerId, {
      type: "tribute_return",
      cardIds: [receivedCardId as string]
    });

    expect(afterReturn.state.phase).toBe("turns");
    expect(afterReturn.state.match.roundNo).toBe(2);
    expect(afterReturn.state.pendingActions.length).toBe(0);
    expect(afterReturn.state.hands[donorPlayerId]?.length).toBe(27);
    expect(afterReturn.state.hands[receiverPlayerId]?.length).toBe(27);
    expect((afterReturn.state.hands.p4 ?? []).map((item) => item.id)).toEqual(untouchedPlayerHandIds);
  });

  it("resets turn to next active player when trick leader has already finished", () => {
    const game = createInitialGame({
      roomId: "r-flow-3",
      gameId: "g-flow-3",
      playerOrder: ["p1", "p2", "p3", "p4"],
      levelRank: 2,
      rng: () => 0.6
    });

    const leadingCard = card("lead-1", "S", 9);
    const state = withRoundState(game, {
      phase: "turns",
      currentTurnIndex: 1,
      finishedOrder: ["p1", "p3"],
      lastPlay: {
        playerId: "p1",
        cards: [leadingCard],
        combo: evaluateCombination([leadingCard], 2),
        seq: 22
      },
      passesInRow: 0,
      hands: {
        p1: [],
        p2: [card("p2-1", "C", 4)],
        p3: [],
        p4: [card("p4-1", "D", 6)]
      }
    });

    const afterPass = applyPlayerAction(state, "p2", {
      type: "pass"
    });

    expect(afterPass.log.reasonCode).toBe("trick_reset");
    expect(afterPass.state.lastPlay).toBeNull();
    expect(afterPass.state.currentTurnIndex).toBe(1);
  });

  it("returns viewer cards only when seat token is valid", () => {
    const owner = roomService.createRoom("owner");
    roomService.joinRoom(owner.room.roomCode, "p2");
    roomService.joinRoom(owner.room.roomCode, "p3");
    roomService.joinRoom(owner.room.roomCode, "p4");

    const started = roomService.startRoomGame(owner.room.roomId, owner.seatToken);

    const viewerState = roomService.getGameState(started.game.id, owner.seatToken);
    expect(viewerState.viewerSeatIndex).not.toBeNull();

    const viewerSeat = viewerState.tableSeats.find((seat) => seat.isViewer);
    expect((viewerSeat?.visibleCards.length ?? 0) > 0).toBe(true);
    expect(viewerState.tableSeats.filter((seat) => !seat.isViewer).every((seat) => seat.visibleCards.length === 0)).toBe(true);

    const spectatorState = roomService.getGameState(started.game.id, null);
    expect(spectatorState.viewerSeatIndex).toBeNull();
    expect(spectatorState.viewerPlayerId).toBeNull();
    expect(spectatorState.tableSeats.every((seat) => seat.visibleCards.length === 0)).toBe(true);
  });
});
