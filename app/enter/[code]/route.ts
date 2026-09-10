import { NextRequest, NextResponse } from "next/server";
import { GRANT_COOKIE_NAME } from "@/lib/auth";
import { getGrantByCode, markGrantRedeemed } from "@/lib/grants";

export const runtime = "nodejs";

const NINETY_DAYS = 60 * 60 * 24 * 90;

/**
 * 対象者にメールで送る「URL＋固有コード」のURL側。
 * 例: https://hikitsugi-ai-six.vercel.app/enter/AB12CD34EF
 *
 * コードが正しければCookieを発行し、そのままインタビュー（または、既に
 * 完了済みなら進捗画面）へ遷移させる。
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  let grant;
  try {
    grant = await getGrantByCode(params.code);
  } catch {
    return NextResponse.redirect(new URL("/login?error=unavailable", req.url));
  }

  if (!grant) {
    return NextResponse.redirect(new URL("/login?error=invalid_code", req.url));
  }

  if (!grant.redeemed_at) {
    await markGrantRedeemed(grant.id);
  }

  const dest = grant.submission_id ? `/progress/${grant.submission_id}` : "/interview";
  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set(GRANT_COOKIE_NAME, grant.code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: NINETY_DAYS,
  });
  return res;
}
