import { buildFallbackReview, chooseAiAction, extractKeyMoments } from "@retro/ai-core";
import {
  applyPlayerAction,
  createInitialGame,
  getCurrentPlayerId,
  getLegalMoves,
  pickMaxCard
} from "@retro/game-engine";
import type {
  AiDifficulty,
  Card,
  GameActionLog,
  GameReview,
  GameState,
  GameUiHints,
  GameTableStateResponse,
  PlayerActionInput,
  RoomSnapshot,
  SeatSnapshot,
  TableSeatPosition,
  TableSeatView
} from "@retro/shared";

interface SeatState extends SeatSnapshot {
  seatToken: string | null;
}

interface RoomState {
  roomId: string;
  roomCode: string;
  status: RoomSnapshot["status"];
  ownerSeatIndex: number;
  levelRank: number;
  seats: SeatState[];
  gameId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SeatTokenBinding {
  roomId: string;
  seatIndex: number;
  playerId: string;
}

interface RuntimeStore {
  rooms: Map<string, RoomState>;
  roomCodeIndex: Map<string, string>;
  games: Map<string, GameState>;
  gameLogs: Map<string, GameActionLog[]>;
  reviews: Map<string, GameReview>;
  seatTokenIndex: Map<string, SeatTokenBinding>;
}

const nowIso = (): string => new Date().toISOString();

const globalStore = globalThis as typeof globalThis & {
  __retroRuntimeStore?: RuntimeStore;
};

const makeStore = (): RuntimeStore => ({
  rooms: new Map(),
  roomCodeIndex: new Map(),
  games: new Map(),
  gameLogs: new Map(),
  reviews: new Map(),
  seatTokenIndex: new Map()
});

const store = (globalStore.__retroRuntimeStore ??= makeStore());

const randomCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * chars.length);
    code += chars[idx];
  }
  return code;
};

const createUniqueRoomCode = (): string => {
  for (let i = 0; i < 30; i += 1) {
    const code = randomCode();
    if (!store.roomCodeIndex.has(code)) {
      return code;
    }
  }
  throw new Error("Failed to generate room code.");
};

const createSeat = (seatIndex: number): SeatState => ({
  seatIndex,
  playerId: null,
  nickname: `Seat ${seatIndex + 1}`,
  isAi: false,
  ready: false,
  connected: false,
  seatToken: null
});

const toSnapshot = (room: RoomState): RoomSnapshot => ({
  roomId: room.roomId,
  roomCode: room.roomCode,
  status: room.status,
  ownerSeatIndex: room.ownerSeatIndex,
  levelRank: room.levelRank,
  seats: room.seats.map((seat) => ({
    seatIndex: seat.seatIndex,
    playerId: seat.playerId,
    nickname: seat.nickname,
    isAi: seat.isAi,
    ready: seat.ready,
    connected: seat.connected
  })),
  gameId: room.gameId
});

const bindSeatToken = (room: RoomState, seatIndex: number, playerId: string): string => {
  const seatToken = crypto.randomUUID();
  const seat = room.seats[seatIndex];
  if (!seat) throw new Error("Invalid seat index");

  seat.seatToken = seatToken;
  seat.playerId = playerId;
  seat.connected = true;
  seat.ready = true;

  store.seatTokenIndex.set(seatToken, {
    roomId: room.roomId,
    seatIndex,
    playerId
  });

  return seatToken;
};

const getBinding = (seatToken: string): SeatTokenBinding | null => {
  return store.seatTokenIndex.get(seatToken) ?? null;
};

const ensureRoom = (roomId: string): RoomState => {
  const room = store.rooms.get(roomId);
  if (!room) {
    throw new Error("Room not found");
  }
  return room;
};

const ensureGame = (gameId: string): GameState => {
  const game = store.games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }
  return game;
};

const resolveSeatByPlayer = (room: RoomState, playerId: string): SeatState | null => {
  return room.seats.find((seat) => seat.playerId === playerId) ?? null;
};

const findNextPlayableTurnIndex = (game: GameState): number | null => {
  const count = game.playerOrder.length;
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (game.currentTurnIndex + offset) % count;
    const playerId = game.playerOrder[index];
    if (!playerId) continue;
    if (game.finishedOrder.includes(playerId)) continue;
    if ((game.hands[playerId]?.length ?? 0) <= 0) continue;
    return index;
  }

  return null;
};

const positionByDelta: Record<number, TableSeatPosition> = {
  0: "bottom",
  1: "right",
  2: "top",
  3: "left"
};

const toTablePosition = (seatIndex: number, viewerSeatIndex: number | null): TableSeatPosition => {
  const anchor = viewerSeatIndex ?? 0;
  const delta = (seatIndex - anchor + 4) % 4;
  return positionByDelta[delta] ?? "bottom";
};

const buildNarrativeLine = (game: GameState, viewerPlayerId: string | null): string => {
  const currentPlayerId = game.playerOrder[game.currentTurnIndex] ?? "未知";
  if (game.phase === "tribute") {
    const pending = game.pendingActions[0];
    if (!pending) return "贡牌阶段进行中，等待系统同步。";
    if (viewerPlayerId && pending.playerId === viewerPlayerId) {
      return pending.action === "tribute_give" ? "轮到你进贡最大牌。" : "轮到你还贡任意牌。";
    }
    return pending.action === "tribute_give" ? "等待进贡方完成贡牌。" : "等待还贡方完成还贡。";
  }

  if (game.phase === "turns") {
    if (viewerPlayerId && currentPlayerId === viewerPlayerId) {
      return game.lastPlay ? "轮到你决策，需压过上手。" : "轮到你首出，掌控本轮节奏。";
    }
    return game.lastPlay ? `当前行动位：${currentPlayerId}，牌势仍在变化。` : `当前行动位：${currentPlayerId}，等待首出。`;
  }

  if (game.phase === "game-finish" || game.phase === "level-up") {
    return "本局收束中，系统正在结算升级。";
  }

  return "牌局进行中。";
};

const buildUiHints = (game: GameState, viewerPlayerId: string | null): GameUiHints => {
  const currentPlayerId = game.playerOrder[game.currentTurnIndex] ?? null;
  const pendingAction = viewerPlayerId
    ? game.pendingActions.find((action) => action.playerId === viewerPlayerId) ?? null
    : null;

  let suggestedAction: GameUiHints["suggestedAction"] = null;
  if (pendingAction?.action) {
    suggestedAction = pendingAction.action;
  } else if (viewerPlayerId && currentPlayerId === viewerPlayerId && game.phase === "turns") {
    suggestedAction = game.lastPlay ? "pass" : "play";
  }

  return {
    turnDeadlineMs: null,
    selectionValidity: {
      valid: false,
      reason: null,
      previewComboType: null
    },
    suggestedAction,
    narrativeLine: buildNarrativeLine(game, viewerPlayerId)
  };
};

const serializeGameForViewer = (
  game: GameState,
  room: RoomState,
  logs: GameActionLog[],
  viewerPlayerId: string | null
): GameTableStateResponse => {
  const viewerSeat = viewerPlayerId ? room.seats.find((seat) => seat.playerId === viewerPlayerId) ?? null : null;
  const viewerSeatIndex = viewerSeat?.seatIndex ?? null;
  const teammateSeatIndex = viewerSeatIndex !== null ? (viewerSeatIndex + 2) % 4 : null;
  const currentPlayerId = game.playerOrder[game.currentTurnIndex] ?? null;
  const pendingPlayerIds = new Set(game.pendingActions.map((action) => action.playerId));

  const tableSeats: TableSeatView[] = room.seats.map((seat) => {
    const isViewer = viewerPlayerId !== null && seat.playerId === viewerPlayerId;
    const handCount = seat.playerId ? (game.hands[seat.playerId]?.length ?? 0) : 0;

    return {
      seatIndex: seat.seatIndex,
      position: toTablePosition(seat.seatIndex, viewerSeatIndex),
      playerId: seat.playerId,
      nickname: seat.nickname,
      isAi: seat.isAi,
      isCurrentTurn: Boolean(
        (currentPlayerId && seat.playerId === currentPlayerId && game.phase === "turns") ||
          (seat.playerId && pendingPlayerIds.has(seat.playerId))
      ),
      isViewer,
      isTeammate: teammateSeatIndex !== null && seat.seatIndex === teammateSeatIndex && !isViewer,
      handCount,
      visibleCards: isViewer && seat.playerId ? [...(game.hands[seat.playerId] ?? [])] : []
    };
  });

  const maskedHands: Record<string, Card[]> = {};
  for (const playerId of game.playerOrder) {
    maskedHands[playerId] = playerId === viewerPlayerId ? [...(game.hands[playerId] ?? [])] : [];
  }

  return {
    game: {
      ...game,
      hands: maskedHands
    },
    logs,
    room: toSnapshot(room),
    viewerPlayerId,
    viewerSeatIndex,
    tableSeats,
    match: game.match,
    pendingActions: [...game.pendingActions],
    ruleMeta: game.ruleMeta,
    uiHints: buildUiHints(game, viewerPlayerId)
  };
};

export const roomService = {
  createRoom(nickname = "玩家"): { room: RoomSnapshot; seatToken: string } {
    const roomId = crypto.randomUUID();
    const roomCode = createUniqueRoomCode();
    const ownerId = `player-${crypto.randomUUID()}`;
    const createdAt = nowIso();

    const room: RoomState = {
      roomId,
      roomCode,
      status: "waiting",
      ownerSeatIndex: 0,
      levelRank: 2,
      seats: [createSeat(0), createSeat(1), createSeat(2), createSeat(3)],
      gameId: null,
      createdAt,
      updatedAt: createdAt
    };

    room.seats[0] = {
      seatIndex: 0,
      playerId: ownerId,
      nickname,
      isAi: false,
      ready: true,
      connected: true,
      seatToken: null
    };

    const seatToken = bindSeatToken(room, 0, ownerId);

    store.rooms.set(roomId, room);
    store.roomCodeIndex.set(roomCode, roomId);

    return { room: toSnapshot(room), seatToken };
  },

  joinRoom(roomCode: string, nickname = "玩家"): { room: RoomSnapshot; seatToken: string } {
    const roomId = store.roomCodeIndex.get(roomCode);
    if (!roomId) throw new Error("Room not found");

    const room = ensureRoom(roomId);
    if (room.status !== "waiting" && room.status !== "ready") {
      throw new Error("Room cannot be joined now");
    }

    const emptySeat = room.seats.find((seat) => !seat.playerId);
    if (!emptySeat) {
      throw new Error("Room is full");
    }

    const playerId = `player-${crypto.randomUUID()}`;
    emptySeat.playerId = playerId;
    emptySeat.nickname = nickname;
    emptySeat.connected = true;
    emptySeat.ready = true;

    const seatToken = bindSeatToken(room, emptySeat.seatIndex, playerId);

    const occupied = room.seats.filter((seat) => Boolean(seat.playerId)).length;
    room.status = occupied === 4 ? "ready" : "waiting";
    room.updatedAt = nowIso();

    return { room: toSnapshot(room), seatToken };
  },

  getRoomById(roomId: string): RoomSnapshot {
    return toSnapshot(ensureRoom(roomId));
  },

  getRoomViewerContext(
    roomId: string,
    seatToken?: string | null
  ): { viewerSeatIndex: number | null; viewerPlayerId: string | null; isOwner: boolean } {
    const room = ensureRoom(roomId);
    const binding = seatToken ? getBinding(seatToken) : null;
    if (!binding || binding.roomId !== roomId) {
      return {
        viewerSeatIndex: null,
        viewerPlayerId: null,
        isOwner: false
      };
    }

    return {
      viewerSeatIndex: binding.seatIndex,
      viewerPlayerId: binding.playerId,
      isOwner: binding.seatIndex === room.ownerSeatIndex
    };
  },

  startRoomGame(roomId: string, seatToken: string): { room: RoomSnapshot; game: GameState } {
    const room = ensureRoom(roomId);
    const binding = getBinding(seatToken);

    if (!binding || binding.roomId !== roomId) {
      throw new Error("Invalid seat token");
    }
    if (binding.seatIndex !== room.ownerSeatIndex) {
      throw new Error("Only room owner can start the game");
    }

    for (const seat of room.seats) {
      if (!seat.playerId) {
        seat.playerId = `ai-${roomId}-${seat.seatIndex}`;
        seat.nickname = `AI-${seat.seatIndex + 1}`;
        seat.isAi = true;
        seat.ready = true;
        seat.connected = true;
      }
    }

    const playerOrder = room.seats.map((seat) => seat.playerId).filter((player): player is string => Boolean(player));
    if (playerOrder.length !== 4) {
      throw new Error("Game requires 4 players");
    }

    const gameId = crypto.randomUUID();
    const game = createInitialGame({
      roomId,
      gameId,
      playerOrder,
      levelRank: room.levelRank
    });

    room.gameId = gameId;
    room.status = "playing";
    room.updatedAt = nowIso();

    store.games.set(gameId, game);
    store.gameLogs.set(gameId, []);

    return { room: toSnapshot(room), game };
  },

  getGameState(
    gameId: string,
    seatToken?: string | null
  ): GameTableStateResponse {
    const game = ensureGame(gameId);
    const logs = store.gameLogs.get(gameId) ?? [];
    const room = ensureRoom(game.roomId);
    const binding = seatToken ? getBinding(seatToken) : null;
    const viewerPlayerId = binding && binding.roomId === game.roomId ? binding.playerId : null;

    return serializeGameForViewer(game, room, logs, viewerPlayerId);
  },

  submitPlayerAction(gameId: string, seatToken: string, action: PlayerActionInput): { game: GameState; log: GameActionLog } {
    const game = ensureGame(gameId);
    const binding = getBinding(seatToken);

    if (!binding || binding.roomId !== game.roomId) {
      throw new Error("Invalid seat token");
    }

    const room = ensureRoom(game.roomId);
    const seat = room.seats[binding.seatIndex];
    if (!seat || seat.playerId !== binding.playerId) {
      throw new Error("Seat token does not match player");
    }

    if (action.type === "toggle_auto") {
      seat.isAi = Boolean(action.enabled);
      const log: GameActionLog = {
        gameId,
        seq: game.actionSeq + 1,
        playerId: binding.playerId,
        type: "toggle_auto",
        cardIds: [],
        reasonCode: action.enabled ? "auto_enabled" : "auto_disabled",
        scoreDelta: 0,
        createdAt: new Date().toISOString()
      };
      game.actionSeq += 1;
      game.updatedAt = log.createdAt;
      const logs = store.gameLogs.get(gameId) ?? [];
      logs.push(log);
      store.gameLogs.set(gameId, logs);
      store.games.set(gameId, game);
      return { game, log };
    }

    const result = applyPlayerAction(game, binding.playerId, action);
    const logs = store.gameLogs.get(gameId) ?? [];
    logs.push(result.log);

    store.games.set(gameId, result.state);
    store.gameLogs.set(gameId, logs);
    room.levelRank = result.state.levelRank;
    room.status = "playing";
    room.updatedAt = nowIso();

    return { game: result.state, log: result.log };
  },

  triggerAiMove(gameId: string, difficulty: AiDifficulty = "normal"): { game: GameState; log: GameActionLog } {
    const game = ensureGame(gameId);
    const room = ensureRoom(game.roomId);
    let result: ReturnType<typeof applyPlayerAction>;

    if (game.phase === "tribute") {
      const pending = game.pendingActions[0];
      if (!pending) {
        throw new Error("No pending tribute action");
      }

      const seat = resolveSeatByPlayer(room, pending.playerId);
      if (!seat || !seat.isAi) {
        throw new Error("Pending tribute action is not controlled by AI");
      }

      const hand = game.hands[pending.playerId] ?? [];
      if (hand.length === 0) {
        throw new Error("AI has no cards for tribute action");
      }

      let selectedCardId: string;
      if (pending.action === "tribute_give") {
        selectedCardId = (pickMaxCard(hand)?.id ?? hand[0]?.id) as string;
      } else {
        selectedCardId = hand[0]?.id as string;
      }

      result = applyPlayerAction(game, pending.playerId, {
        type: pending.action,
        cardIds: [selectedCardId]
      });
    } else {
      const currentPlayerId = getCurrentPlayerId(game);
      const currentHandCount = game.hands[currentPlayerId]?.length ?? 0;
      const currentPlayerFinished = game.finishedOrder.includes(currentPlayerId) || currentHandCount <= 0;

      if (currentPlayerFinished) {
        const nextTurnIndex = findNextPlayableTurnIndex(game);
        if (nextTurnIndex === null) {
          throw new Error("No playable player available.");
        }

        const repairedAt = nowIso();
        const repairedGame: GameState = {
          ...game,
          currentTurnIndex: nextTurnIndex,
          actionSeq: game.actionSeq + 1,
          updatedAt: repairedAt
        };

        const repairedLog: GameActionLog = {
          gameId,
          seq: repairedGame.actionSeq,
          playerId: currentPlayerId,
          type: "pass",
          cardIds: [],
          reasonCode: "turn_repair_skip_finished",
          scoreDelta: 0,
          createdAt: repairedAt
        };

        const logs = store.gameLogs.get(gameId) ?? [];
        logs.push(repairedLog);

        store.games.set(gameId, repairedGame);
        store.gameLogs.set(gameId, logs);
        room.levelRank = repairedGame.levelRank;
        room.status = "playing";
        room.updatedAt = nowIso();

        return { game: repairedGame, log: repairedLog };
      }

      const seat = resolveSeatByPlayer(room, currentPlayerId);

      if (!seat || !seat.isAi) {
        throw new Error("Current player is not AI");
      }

      try {
        const decision = chooseAiAction(game, currentPlayerId, difficulty);
        result = applyPlayerAction(game, currentPlayerId, decision.action);
        result.log.reasonCode = decision.reasonCode;
        result.log.scoreDelta += Math.round(decision.score / 10);
      } catch (error) {
        const legalMoves = getLegalMoves(game, currentPlayerId).filter((move) => move.type === "play");
        const fallback = legalMoves[0];
        if (!fallback) {
          throw error;
        }

        result = applyPlayerAction(game, currentPlayerId, {
          type: "play",
          cardIds: fallback.cards.map((card) => card.id)
        });
        result.log.reasonCode = "ai_fallback_play";
      }
    }

    const logs = store.gameLogs.get(gameId) ?? [];
    logs.push(result.log);

    store.games.set(gameId, result.state);
    store.gameLogs.set(gameId, logs);
    room.levelRank = result.state.levelRank;
    room.status = "playing";
    room.updatedAt = nowIso();

    return { game: result.state, log: result.log };
  },

  async generateReview(gameId: string): Promise<GameReview> {
    const game = ensureGame(gameId);
    const existing = store.reviews.get(gameId);
    if (existing) return existing;

    const logs = store.gameLogs.get(gameId) ?? [];
    const fallback = buildFallbackReview(gameId, logs);
    fallback.keyMoments = extractKeyMoments(logs, 5);

    store.reviews.set(gameId, fallback);
    return fallback;
  },

  setReview(gameId: string, review: GameReview): GameReview {
    store.reviews.set(gameId, review);
    return review;
  },

  getReview(gameId: string): GameReview | null {
    return store.reviews.get(gameId) ?? null;
  }
};
