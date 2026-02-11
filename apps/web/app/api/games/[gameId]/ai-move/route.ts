import { NextRequest, NextResponse } from "next/server";
import type { AiDifficulty } from "@retro/shared";
import { ok } from "@/src/lib/http";
import { publishGameEvent } from "@/src/server/realtime";
import { roomService } from "@/src/server/store";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> }
): Promise<NextResponse> {
  const { gameId } = await ctx.params;

  try {
    const body = (await req.json().catch(() => ({}))) as { difficulty?: AiDifficulty };
    const result = roomService.triggerAiMove(gameId, body.difficulty ?? "normal");

    await publishGameEvent({
      type: result.game.phase === "game-finish" ? "game.ended" : "move.accepted",
      roomId: result.game.roomId,
      gameId,
      payload: {
        state: result.game,
        log: result.log,
        ai: true
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
      { error: { code: "AI_MOVE_FAILED", message: (error as Error).message } },
      { status: 400 }
    );
  }
}
