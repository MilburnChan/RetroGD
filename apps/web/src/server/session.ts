import type { NextRequest, NextResponse } from "next/server";

export const SEAT_TOKEN_COOKIE = "retro_seat_token";

export const readSeatToken = (req: Request | NextRequest): string | null => {
  const raw = req.headers.get("cookie");
  if (!raw) return null;

  const token = raw
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SEAT_TOKEN_COOKIE}=`))
    ?.split("=")[1];

  return token ?? null;
};

export const attachSeatCookie = (res: NextResponse, seatToken: string): NextResponse => {
  res.cookies.set(SEAT_TOKEN_COOKIE, seatToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return res;
};
