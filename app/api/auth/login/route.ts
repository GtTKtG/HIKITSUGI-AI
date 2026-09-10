import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, verifyAndIssueToken } from "@/lib/auth";

export const runtime = "nodejs";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして解釈できません" }, { status: 400 });
  }

  const code = typeof (body as { code?: unknown })?.code === "string" ? (body as { code: string }).code : "";

  const token = await verifyAndIssueToken(code);
  if (!token) {
    return NextResponse.json({ error: "合言葉が正しくありません" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return res;
}
