import { cookies } from "next/headers";
import { ACCESS_COOKIE_NAME, GRANT_COOKIE_NAME, getExpectedAccessToken } from "@/lib/auth";
import { getGrantByCode, type AccessGrant } from "@/lib/grants";

/**
 * 現在のリクエストの認証状態（Node runtime専用、route handler / server componentから使う）。
 * - admin: 運営者用マスターコードでログイン済み。全データにアクセス可。
 * - grant: 顧客固有コードでアクセス中。自分の案件（grant）のデータのみアクセス可。
 * - none: 未認証（middlewareで弾かれているはずだが、念のための防御的チェック用）。
 */
export type CurrentAuth =
  | { kind: "admin" }
  | { kind: "grant"; grant: AccessGrant }
  | { kind: "none" };

export async function getCurrentAuth(): Promise<CurrentAuth> {
  const store = cookies();

  const expected = await getExpectedAccessToken();
  if (expected) {
    const adminToken = store.get(ACCESS_COOKIE_NAME)?.value;
    if (adminToken === expected) return { kind: "admin" };
  }

  const grantCode = store.get(GRANT_COOKIE_NAME)?.value;
  if (grantCode) {
    const grant = await getGrantByCode(grantCode);
    if (grant) return { kind: "grant", grant };
  }

  // ACCESS_CODE が未設定（ゲート無効の初期状態）の場合、本番以外では便宜上 admin
  // 扱いにする（middleware側も本番以外は全面素通しにしているため、この関数内だけ
  // 挙動を変えると画面ごとに矛盾するのを避ける）。本番でACCESS_CODEが未設定なのは
  // 設定不備であり、middlewareが既に全リクエストを拒否しているはずだが、念のため
  // ここでも admin 扱いにはせず none を返す（fail-closed。外部レビュー指摘対応）。
  if (!expected) {
    return process.env.NODE_ENV === "production" ? { kind: "none" } : { kind: "admin" };
  }

  return { kind: "none" };
}

/**
 * この認証状態で、指定した interview_submissions の id にアクセスしてよいか。
 * admin は常に可。grant は自分の案件（grant.submission_id）と一致する場合のみ可。
 */
export function canAccessSubmission(auth: CurrentAuth, submissionId: string): boolean {
  if (auth.kind === "admin") return true;
  if (auth.kind === "grant") return auth.grant.submission_id === submissionId;
  return false;
}
