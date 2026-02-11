import { NextResponse } from "next/server";
import { ok } from "@/src/lib/http";
import { consumeRateLimit } from "@/src/server/rate-limit";
import { publishGameEvent } from "@/src/server/realtime";
import { generateReview } from "@/src/server/review";
import { roomService } from "@/src/server/store";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ gameId: string }> }
): Promise<NextResponse> {
  const ip = _req.headers.get("x-forwarded-for") ?? "local";
  if (!consumeRateLimit(`game-review:${ip}`, 8, 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "复盘请求过于频繁，请稍后再试" } },
      { status: 429 }
    );
  }

  const { gameId } = await ctx.params;

  try {
    const current = roomService.getReview(gameId);
    if (current) {
      return ok({ review: current, cached: true });
    }

    const { game, logs, match } = roomService.getGameState(gameId);
    if (!match.lastRoundResult) {
      return NextResponse.json(
        { error: { code: "ROUND_NOT_FINISHED", message: "Review can be generated only after one round is finished" } },
        { status: 400 }
      );
    }

    const review = await generateReview(game, logs);
    roomService.setReview(gameId, review);

    await publishGameEvent({
      type: "review.ready",
      roomId: game.roomId,
      gameId,
      payload: review
    });

    return ok({ review, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "REVIEW_FAILED", message: (error as Error).message } },
      { status: 400 }
    );
  }
}
