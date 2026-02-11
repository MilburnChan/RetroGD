import { NextRequest, NextResponse } from "next/server";
import { ok, unauthorized } from "@/src/lib/http";
import { publishGameEvent, publishRoomEvent } from "@/src/server/realtime";
import { readSeatToken } from "@/src/server/session";
import { roomService } from "@/src/server/store";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }
): Promise<NextResponse> {
  const { roomId } = await ctx.params;
  const token = readSeatToken(req);
  if (!token) {
    return unauthorized("seat token is missing");
  }

  try {
    const { room, game } = roomService.startRoomGame(roomId, token);

    await publishRoomEvent({
      type: "room.updated",
      roomId,
      payload: room
    });

    await publishGameEvent({
      type: "game.started",
      roomId,
      gameId: game.id,
      payload: {
        gameId: game.id,
        playerOrder: game.playerOrder
      }
    });

    return ok({ roomSnapshot: room, game });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "START_GAME_FAILED", message: (error as Error).message } },
      { status: 400 }
    );
  }
}
