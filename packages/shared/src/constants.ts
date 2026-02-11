export const ROOM_CODE_LENGTH = 6;
export const ROOM_SEAT_COUNT = 4;
export const ROOM_STATUS: Record<string, string> = {
  WAITING: "waiting",
  READY: "ready",
  PLAYING: "playing",
  FINISHED: "finished"
};

export const ERROR_CODES = {
  INVALID_ACTION: "INVALID_ACTION",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  GAME_NOT_FOUND: "GAME_NOT_FOUND",
  NOT_YOUR_TURN: "NOT_YOUR_TURN",
  INVALID_SEAT: "INVALID_SEAT",
  UNAUTHORIZED: "UNAUTHORIZED"
} as const;

export const REALTIME_EVENTS = {
  ROOM_UPDATED: "room.updated",
  GAME_STARTED: "game.started",
  TURN_CHANGED: "turn.changed",
  MOVE_ACCEPTED: "move.accepted",
  GAME_ENDED: "game.ended",
  REVIEW_READY: "review.ready"
} as const;
