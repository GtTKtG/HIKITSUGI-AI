/**
 * 簡易アクセスゲート（URL + 合言葉方式）。
 *
 * モニター期間（運営者1名・少数の対象企業）向けの最小限のアクセス制御。
 * 運営者・対象者で共通の1つの合言葉（環境変数 ACCESS_CODE）を入力すると、
 * 署名付きCookieが発行され、以後そのブラウザからのアクセスが許可される。
 *
 * 本番の複数顧客データを扱う場合は、仕様書4章の「顧客ごとのデータ分離」に
 * 対応した個別ログイン（企業単位のアカウント等）への置き換えが必須。
 *
 * middleware（Edge runtime）と route handler（Node runtime）の両方から
 * 呼ばれるため、Web Crypto API（globalThis.crypto.subtle）のみを使い、
 * node:crypto には依存しない。
 */

export const ACCESS_COOKIE_NAME = "hikitsugi_access";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 合言葉が正しく設定されているCookie値（合言葉そのものではなくハッシュ）を返す。 */
export async function getExpectedAccessToken(): Promise<string | null> {
  const code = process.env.ACCESS_CODE;
  if (!code) return null;
  return sha256Hex(`hikitsugi-ai-access-gate-v1:${code}`);
}

/** 入力された合言葉が正しければ、Cookieに設定すべきトークンを返す。誤っていれば null。 */
export async function verifyAndIssueToken(input: string): Promise<string | null> {
  const code = process.env.ACCESS_CODE;
  if (!code || !input || input !== code) return null;
  return sha256Hex(`hikitsugi-ai-access-gate-v1:${code}`);
}
