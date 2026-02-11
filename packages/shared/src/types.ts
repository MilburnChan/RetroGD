export type RoomStatus = "waiting" | "ready" | "playing" | "finished";
export type GamePhase = "dealing" | "turns" | "hand-finish" | "game-finish" | "tribute" | "level-up";
export type AiDifficulty = "easy" | "normal" | "hard";

export type CardSuit = "S" | "H" | "C" | "D" | "BJ" | "RJ";

export interface Card {
  id: string;
  suit: CardSuit;
  rank: number;
  display: string;
}

export type CombinationType =
  | "single"
  | "pair"
  | "triple"
  | "triple_with_pair"
  | "straight"
  | "straight_flush"
  | "consecutive_pairs"
  | "steel"
  | "bomb"
  | "joker_bomb"
  | "invalid";

export interface CardCombination {
  type: CombinationType;
  length: number;
  primaryRank: number;
  chainLength?: number;
  kickerRanks?: number[];
  wildcardCount?: number;
  effectiveRanks?: number[];
}

export type PlayerActionType = "play" | "pass" | "toggle_auto" | "tribute_give" | "tribute_return";

export interface PlayerActionInput {
  type: PlayerActionType;
  cardIds?: string[];
  enabled?: boolean;
}

export interface PlayRecord {
  playerId: string;
  cards: Card[];
  combo: CardCombination;
  seq: number;
}

export type RoundResultMode = "double_down" | "single_down" | "opponent";

export interface RoundResult {
  winnerTeam: number;
  mode: RoundResultMode;
  finishOrder: string[];
  upgradeDelta: number;
}

export interface TributeState {
  donorPlayerId: string;
  receiverPlayerId: string;
  status: "pending_give" | "pending_return" | "completed";
  givenCard?: Card;
  returnedCard?: Card;
}

export interface PendingAction {
  playerId: string;
  action: "tribute_give" | "tribute_return";
}

export interface MatchState {
  teamLevel: {
    team0: number;
    team1: number;
  };
  roundNo: number;
  lastRoundResult: RoundResult | null;
  pendingTribute: TributeState | null;
  antiTributeTriggered: boolean;
}

export interface RuleMeta {
  levelRank: number;
  wildcard: {
    enabled: boolean;
    suit: "H";
    rank: number;
  };
  comparePolicy: "same_type_same_length";
}

export interface GameState {
  id: string;
  roomId: string;
  phase: GamePhase;
  levelRank: number;
  playerOrder: string[];
  hands: Record<string, Card[]>;
  currentTurnIndex: number;
  lastPlay: PlayRecord | null;
  passesInRow: number;
  finishedOrder: string[];
  winnerTeam: number | null;
  actionSeq: number;
  match: MatchState;
  pendingActions: PendingAction[];
  ruleMeta: RuleMeta;
  createdAt: string;
  updatedAt: string;
}

export interface SeatSnapshot {
  seatIndex: number;
  playerId: string | null;
  nickname: string;
  isAi: boolean;
  ready: boolean;
  connected: boolean;
}

export interface RoomSnapshot {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  ownerSeatIndex: number;
  levelRank: number;
  seats: SeatSnapshot[];
  gameId: string | null;
}

export type TableSeatPosition = "bottom" | "left" | "top" | "right";

export interface TableSeatView {
  seatIndex: number;
  position: TableSeatPosition;
  playerId: string | null;
  nickname: string;
  isAi: boolean;
  isCurrentTurn: boolean;
  isViewer: boolean;
  isTeammate: boolean;
  handCount: number;
  visibleCards: Card[];
}

export interface RoomEvent {
  type: "room.updated";
  roomId: string;
  payload: RoomSnapshot;
}

export interface GameEvent {
  type: "game.started" | "turn.changed" | "move.accepted" | "game.ended" | "review.ready";
  roomId: string;
  gameId: string;
  payload: unknown;
}

export interface GameActionLog {
  gameId: string;
  seq: number;
  playerId: string;
  type: PlayerActionType;
  cardIds: string[];
  reasonCode: string;
  scoreDelta: number;
  createdAt: string;
}

export interface GameUiHints {
  turnDeadlineMs: number | null;
  selectionValidity: {
    valid: boolean;
    reason: string | null;
    previewComboType: string | null;
  };
  suggestedAction: "play" | "pass" | "tribute_give" | "tribute_return" | null;
  narrativeLine: string | null;
}

export interface GameTableStateResponse {
  game: GameState;
  logs: GameActionLog[];
  room: RoomSnapshot;
  viewerPlayerId: string | null;
  viewerSeatIndex: number | null;
  tableSeats: TableSeatView[];
  match: MatchState;
  pendingActions: PendingAction[];
  ruleMeta: RuleMeta;
  uiHints: GameUiHints;
}

export interface KeyMoment {
  seq: number;
  playerId: string;
  why: string;
  impact: number;
}

export interface GameReview {
  gameId: string;
  language: "zh-CN";
  summary: string;
  keyMoments: KeyMoment[];
  alternatives: string[];
  suggestions: string[];
  createdAt: string;
  model: string;
}

export interface ApiError {
  code: string;
  message: string;
}
