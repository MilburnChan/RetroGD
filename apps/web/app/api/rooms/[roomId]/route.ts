import { NextResponse } from "next/server";
import { ok } from "@/src/lib/http";
import { readSeatToken } from "@/src/server/session";
import { roomService } from "@/src/server/store";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ roomId: string }> }
): Promise<NextResponse> {
  const { roomId } = await ctx.params;

  try {
    const roomSnapshot = roomService.getRoomById(roomId);
    const viewer = roomService.getRoomViewerContext(roomId, readSeatToken(_req));
    return ok({ roomSnapshot, viewer });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "ROOM_NOT_FOUND", message: (error as Error).message } },
      { status: 404 }
    );
  }
}
