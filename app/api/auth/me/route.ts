import { NextResponse } from "next/server";
import { getCurrentAuth } from "@/lib/authServer";
import { getChatSession } from "@/lib/supabase/chatSessions";

export const runtime = "nodejs";

/**
 * 現在の認証状態をフロントエンドに返す。顧客固有コードでアクセス中の場合は
 * 会社名・対象者名（登録済みの値）、既に完了済みならその submission_id、
 * 進行中のセッションがあればその会話履歴（session_id / messages）を返す。
 * /interview 側で入力フォームを省略したり、結果画面へ誘導したり、
 * 再読み込み時に会話を復元したりするのに使う。
 */
export async function GET() {
  const auth = await getCurrentAuth();

  if (auth.kind === "grant") {
    const session = auth.grant.chat_session_id
      ? await getChatSession(auth.grant.chat_session_id)
      : null;

    return NextResponse.json({
      kind: "grant",
      company_name: auth.grant.company_name,
      employee_name: auth.grant.employee_name,
      submission_id: auth.grant.submission_id,
      session_id: session?.id ?? null,
      messages: session?.messages ?? [],
    });
  }

  return NextResponse.json({ kind: auth.kind });
}
