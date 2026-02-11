import { describe, expect, it } from "vitest";
import { roomService } from "../apps/web/src/server/store";

describe("ui hints", () => {
  it("includes uiHints in game state and derives suggestedAction consistently", () => {
    const owner = roomService.createRoom("owner-ui");
    roomService.joinRoom(owner.room.roomCode, "p2-ui");
    roomService.joinRoom(owner.room.roomCode, "p3-ui");
    roomService.joinRoom(owner.room.roomCode, "p4-ui");

    const started = roomService.startRoomGame(owner.room.roomId, owner.seatToken);
    const state = roomService.getGameState(started.game.id, owner.seatToken);

    const currentPlayerId = state.game.playerOrder[state.game.currentTurnIndex] ?? null;
    const pendingAction = state.pendingActions.find((action) => action.playerId === state.viewerPlayerId) ?? null;

    let expectedSuggestedAction: "play" | "pass" | "tribute_give" | "tribute_return" | null = null;
    if (pendingAction?.action) {
      expectedSuggestedAction = pendingAction.action;
    } else if (
      state.viewerPlayerId &&
      currentPlayerId === state.viewerPlayerId &&
      state.game.phase === "turns"
    ) {
      expectedSuggestedAction = state.game.lastPlay ? "pass" : "play";
    }

    expect(state.uiHints).toBeDefined();
    expect(state.uiHints.narrativeLine).toBeTypeOf("string");
    expect(state.uiHints.selectionValidity.valid).toBe(false);
    expect(state.uiHints.suggestedAction).toBe(expectedSuggestedAction);
  });

  it("returns viewer context for room owner and spectator", () => {
    const owner = roomService.createRoom("owner-room-view");
    const asOwner = roomService.getRoomViewerContext(owner.room.roomId, owner.seatToken);
    const asSpectator = roomService.getRoomViewerContext(owner.room.roomId, null);

    expect(asOwner.isOwner).toBe(true);
    expect(asOwner.viewerSeatIndex).toBe(0);
    expect(asOwner.viewerPlayerId).toBeTruthy();

    expect(asSpectator.isOwner).toBe(false);
    expect(asSpectator.viewerSeatIndex).toBeNull();
    expect(asSpectator.viewerPlayerId).toBeNull();
  });
});
