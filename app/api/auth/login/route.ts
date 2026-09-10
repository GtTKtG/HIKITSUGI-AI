import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, GRANT_COOKIE_NAME, verifyAndIssueAdminToken } from "@/lib/auth";
import { getGrantByCode, markGrantRedeemed } from "@/lib/grants";

export const runtime = "nodejs";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const NINETY_DAYS = 60 * 60 * 24 * 90;

/**
 * 運営者用マスターコード、または顧客固有コードのどちらでもログインできる。
 * （固有コードは通常 /enter/<code> のリンクを踏むだけで入れるが、リンクが
 * 開けない場合の代替手段としてここでも受け付ける。）
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして解釈できません" }, { status: 400 });
  }

  const code = typeof (body as { code?: unknown })?.code === "string" ? (body as { code: string }).code : "";

  const adminToken = await verifyAndIssueAdminToken(code);
  if (adminToken) {
    const res = NextResponse.json({ ok: true, kind: "admin" });
    res.cookies.set(ACCESS_COOKIE_NAME, adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
    return res;
  }

  const grant = await getGrantByCode(code).catch(() => null);
  if (grant) {
    if (!grant.redeemed_at) await markGrantRedeemed(grant.id);
    const res = NextResponse.json({
      ok: true,
      kind: "grant",
      redirect: grant.submission_id ? `/progress/${grant.submission_id}` : "/interview",
    });
    res.cookies.set(GRANT_COOKIE_NAME, grant.code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: NINETY_DAYS,
    });
    return res;
  }

  return NextResponse.json({ error: "コードが正しくありません" }, { status: 401 });
}
