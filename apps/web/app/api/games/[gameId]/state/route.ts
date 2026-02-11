import { NextResponse } from "next/server";
import { ok } from "@/src/lib/http";
import { readSeatToken } from "@/src/server/session";
import { roomService } from "@/src/server/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ gameId: string }> }
): Promise<NextResponse> {
  const { gameId } = await ctx.params;

  try {
    const state = roomService.getGameState(gameId, readSeatToken(req));
    return ok(state);
  } catch (error) {
    return NextResponse.json(
      { error: { code: "STATE_FAILED", message: (error as Error).message } },
      { status: 404 }
    );
  }
}
