import type { GameEvent, RoomEvent } from "@retro/shared";

// 首版采用内存实现，后续可替换为 Supabase Realtime broadcast。
export const publishRoomEvent = async (event: RoomEvent): Promise<void> => {
  if (process.env.NODE_ENV !== "production") {
    console.info("[room-event]", event.type, event.roomId);
  }
};

export const publishGameEvent = async (event: GameEvent): Promise<void> => {
  if (process.env.NODE_ENV !== "production") {
    console.info("[game-event]", event.type, event.gameId);
  }
};
