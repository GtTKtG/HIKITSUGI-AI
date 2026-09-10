/**
 * アクセス制御（運営者用マスターコード ＋ 顧客ごとの固有コードの2階層）。
 *
 * - 運営者用マスターコード（ACCESS_COOKIE_NAME / 環境変数 ACCESS_CODE）：
 *   /admin 等の運営者専用画面や、全データへのアクセスに使う。
 * - 顧客ごとの固有アクセスコード（GRANT_COOKIE_NAME、lib/grants.ts）：
 *   運営者が案件を作成すると発行され、対象者はそのコードで自分の案件の
 *   インタビュー・結果のみにアクセスできる（/enter/<code> で発行）。
 *
 * 本番の複数顧客データを扱う場合、この2階層でも仕様書4章の要件を完全には
 * 満たさない（保存期間設定・削除機能等は別途必要）が、顧客間のデータ分離の
 * 最低限は満たす。
 *
 * middleware（Edge runtime）と route handler（Node runtime）の両方から
 * 呼ばれる可能性があるため、このファイルは Web Crypto API
 * （globalThis.crypto.subtle）のみを使い、node:crypto には依存しない。
 */

export const ACCESS_COOKIE_NAME = "hikitsugi_access";
export const GRANT_COOKIE_NAME = "hikitsugi_grant";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** マスターコードが正しく設定されている場合のCookie値（コードそのものではなくハッシュ）を返す。 */
export async function getExpectedAccessToken(): Promise<string | null> {
  const code = process.env.ACCESS_CODE;
  if (!code) return null;
  return sha256Hex(`hikitsugi-ai-access-gate-v1:${code}`);
}

/** 入力されたマスターコードが正しければ、Cookieに設定すべきトークンを返す。誤っていれば null。 */
export async function verifyAndIssueAdminToken(input: string): Promise<string | null> {
  const code = process.env.ACCESS_CODE;
  if (!code || !input || input !== code) return null;
  return sha256Hex(`hikitsugi-ai-access-gate-v1:${code}`);
}
