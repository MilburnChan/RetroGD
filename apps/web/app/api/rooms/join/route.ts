import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/src/lib/http";
import { consumeRateLimit } from "@/src/server/rate-limit";
import { publishRoomEvent } from "@/src/server/realtime";
import { attachSeatCookie } from "@/src/server/session";
import { roomService } from "@/src/server/store";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!consumeRateLimit(`join-room:${ip}`, 30, 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "加入房间请求过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json()) as { roomCode?: string; nickname?: string };

    if (!body.roomCode) {
      return NextResponse.json(
        { error: { code: "INVALID_ROOM_CODE", message: "roomCode is required" } },
        { status: 400 }
      );
    }

    const { room, seatToken } = roomService.joinRoom(body.roomCode.trim().toUpperCase(), body.nickname?.trim() || "玩家");

    await publishRoomEvent({
      type: "room.updated",
      roomId: room.roomId,
      payload: room
    });

    const res = ok({ roomSnapshot: room, seatToken });
    return attachSeatCookie(res, seatToken);
  } catch (error) {
    return NextResponse.json(
      { error: { code: "JOIN_ROOM_FAILED", message: (error as Error).message } },
      { status: 400 }
    );
  }
}
