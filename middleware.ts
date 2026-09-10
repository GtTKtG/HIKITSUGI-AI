import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, GRANT_COOKIE_NAME, getExpectedAccessToken } from "@/lib/auth";

// 認証ゲートを素通りさせるパス（ログイン・コード発行の入口と、静的アセット）。
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/enter"];

// 運営者用マスターコードでのみアクセス可能なパス（顧客の固有コードでは入れない）。
// /interview/transcript, /api/interview/process は「運営者が代理入力する」
// 従来方式（7.3の代替運用）なので、顧客の固有コードでは使わせない
// （使わせると、その顧客のgrantに紐付かない孤立したデータができてしまう）。
const ADMIN_ONLY_PREFIXES = ["/admin", "/api/admin", "/interview/transcript", "/api/interview/process"];

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

  const isAdmin = req.cookies.get(ACCESS_COOKIE_NAME)?.value === expected;

  const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAdminOnly) {
    if (isAdmin) return NextResponse.next();
    return denyOrRedirect(req, pathname);
  }

  if (isAdmin) return NextResponse.next();

  // 顧客固有コードのCookieがあれば通す。そのコードが実在し、かつ要求している
  // データ（例: 進捗画面の[id]）が自分の案件のものかどうかの詳細チェックは、
  // DBアクセスが必要なため各ページ／APIハンドラ（Node runtime）側で行う。
  const grantCode = req.cookies.get(GRANT_COOKIE_NAME)?.value;
  if (grantCode) return NextResponse.next();

  return denyOrRedirect(req, pathname);
}

function denyOrRedirect(req: NextRequest, pathname: string) {
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
