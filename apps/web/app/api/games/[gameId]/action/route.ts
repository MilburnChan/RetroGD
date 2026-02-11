import { NextRequest, NextResponse } from "next/server";
import type { PlayerActionInput } from "@retro/shared";
import { ok, unauthorized } from "@/src/lib/http";
import { consumeRateLimit } from "@/src/server/rate-limit";
import { publishGameEvent } from "@/src/server/realtime";
import { readSeatToken } from "@/src/server/session";
import { roomService } from "@/src/server/store";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> }
): Promise<NextResponse> {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!consumeRateLimit(`game-action:${ip}`, 80, 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "动作请求过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  const { gameId } = await ctx.params;
  const seatToken = readSeatToken(req);
  if (!seatToken) {
    return unauthorized("seat token is missing");
  }

  try {
    const body = (await req.json()) as PlayerActionInput;
    const result = roomService.submitPlayerAction(gameId, seatToken, body);

    await publishGameEvent({
      type: result.game.phase === "game-finish" ? "game.ended" : "move.accepted",
      roomId: result.game.roomId,
      gameId,
      payload: {
        state: result.game,
        log: result.log
      }
    });

    await publishGameEvent({
      type: "turn.changed",
      roomId: result.game.roomId,
      gameId,
      payload: {
        currentTurnIndex: result.game.currentTurnIndex,
        seq: result.game.actionSeq
      }
    });

    return ok(result);
  } catch (error) {
    return NextResponse.json(
      { error: { code: "ACTION_FAILED", message: (error as Error).message } },
      { status: 400 }
    );
  }
}
