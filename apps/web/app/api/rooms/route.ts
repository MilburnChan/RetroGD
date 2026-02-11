import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/src/lib/http";
import { consumeRateLimit } from "@/src/server/rate-limit";
import { publishRoomEvent } from "@/src/server/realtime";
import { attachSeatCookie } from "@/src/server/session";
import { roomService } from "@/src/server/store";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!consumeRateLimit(`create-room:${ip}`, 20, 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "创建房间过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { nickname?: string };
    const nickname = body.nickname?.trim() || "玩家";

    const { room, seatToken } = roomService.createRoom(nickname);

    await publishRoomEvent({
      type: "room.updated",
      roomId: room.roomId,
      payload: room
    });

    const res = ok({
      roomId: room.roomId,
      roomCode: room.roomCode,
      seatToken,
      roomSnapshot: room
    });

    return attachSeatCookie(res, seatToken);
  } catch (error) {
    return NextResponse.json(
      { error: { code: "CREATE_ROOM_FAILED", message: (error as Error).message } },
      { status: 400 }
    );
  }
}
