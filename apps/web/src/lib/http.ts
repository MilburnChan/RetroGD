import { NextResponse } from "next/server";

export const ok = <T>(data: T, init?: ResponseInit): NextResponse<T> => {
  return NextResponse.json(data, { status: 200, ...init });
};

export const badRequest = (message: string, code = "BAD_REQUEST"): NextResponse => {
  return NextResponse.json(
    {
      error: {
        code,
        message
      }
    },
    { status: 400 }
  );
};

export const unauthorized = (message = "Unauthorized"): NextResponse => {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message
      }
    },
    { status: 401 }
  );
};

export const notFound = (message = "Not found"): NextResponse => {
  return NextResponse.json(
    {
      error: {
        code: "NOT_FOUND",
        message
      }
    },
    { status: 404 }
  );
};
