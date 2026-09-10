import { NextResponse } from "next/server";
import { getCurrentAuth } from "@/lib/authServer";

export const runtime = "nodejs";

/**
 * 現在の認証状態をフロントエンドに返す。顧客固有コードでアクセス中の場合は
 * 会社名・対象者名（登録済みの値）や、既に完了済みならその submission_id を返し、
 * /interview 側で入力フォームを省略したり結果画面へ誘導したりするのに使う。
 */
export async function GET() {
  const auth = await getCurrentAuth();

  if (auth.kind === "grant") {
    return NextResponse.json({
      kind: "grant",
      company_name: auth.grant.company_name,
      employee_name: auth.grant.employee_name,
      submission_id: auth.grant.submission_id,
    });
  }

  return NextResponse.json({ kind: auth.kind });
}
