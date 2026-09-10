import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, getExpectedAccessToken } from "@/lib/auth";

// 認証ゲートを素通りさせるパス（ログイン画面自体とそのAPI、静的アセット）。
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const expected = await getExpectedAccessToken();
  // ACCESS_CODE が未設定の場合はゲートを機能させられないため、素通りさせる
  // （開発環境や、まだ環境変数を設定していない初期デプロイでアプリ自体が
  // 使えなくなるのを避けるため。設定後は必ずゲートが有効になる）。
  if (!expected) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
  if (token === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
