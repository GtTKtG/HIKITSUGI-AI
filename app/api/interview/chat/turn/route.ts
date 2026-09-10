import { NextRequest, NextResponse } from "next/server";
import { ChatTurnRequestSchema, type ChatMessage } from "@/lib/schema";
import { runChatTurn, InterviewProcessingError } from "@/lib/anthropic";
import {
  createChatSession,
  getChatSession,
  updateChatSessionMessages,
  completeChatSession,
} from "@/lib/supabase/chatSessions";
import { createSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import { linkGrantChatSession, linkGrantSubmission } from "@/lib/grants";
import { getCurrentAuth } from "@/lib/authServer";

export const runtime = "nodejs";

/**
 * POST /api/interview/chat/turn
 *
 * チャット版AIインタビュー（新仕様書5章・7.1・7.2）の1ターンを処理する。
 *
 * - session_id を渡さない最初の呼び出しで新しいセッションを作成し、AIからの
 *   最初の質問を返す。顧客固有コード（access_grants）でアクセス中の場合、
 *   会社名・対象者名はそのコードに登録済みの値を使い、そのコードにセッションを
 *   紐付ける（以後そのコードでしか続きにアクセスできない）。
 * - 以降は session_id と対象者の発言（message）を渡して呼ぶ。
 * - AIが全項目の聞き取りを終えたら（type: "done"）、結果を interview_submissions に
 *   保存し、submission_id を返す。呼び出し側はそのIDで /progress/[id] 等へ遷移する。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして解釈できません" }, { status: 400 });
  }

  const parsed = ChatTurnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "リクエストが不正です", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { session_id, message, company_name, employee_name } = parsed.data;

  try {
    const auth = await getCurrentAuth();
    if (auth.kind === "none") {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    let session;
    if (session_id) {
      session = await getChatSession(session_id);
      // 顧客固有コードでアクセス中の場合、自分に紐づくセッション以外は続けられない
      // （他人のセッションIDを知っていても継続できないようにする）。
      if (auth.kind === "grant" && session && session.id !== auth.grant.chat_session_id) {
        return NextResponse.json({ error: "このインタビューにはアクセスできません" }, { status: 403 });
      }
    } else if (auth.kind === "grant" && auth.grant.chat_session_id) {
      // 顧客固有コードに既にセッションが紐付いている場合はそれを継続する
      // （同じコードで複数のインタビューを開始できないようにする）。
      session = await getChatSession(auth.grant.chat_session_id);
    } else {
      const names =
        auth.kind === "grant"
          ? { companyName: auth.grant.company_name ?? undefined, employeeName: auth.grant.employee_name ?? undefined }
          : { companyName: company_name, employeeName: employee_name };
      session = await createChatSession(names);
      if (auth.kind === "grant") {
        await linkGrantChatSession(auth.grant.id, session.id);
      }
    }

    if (!session) {
      return NextResponse.json({ error: "指定されたセッションが見つかりません" }, { status: 404 });
    }
    if (session.status === "completed") {
      return NextResponse.json({ error: "このインタビューはすでに完了しています" }, { status: 409 });
    }

    let turn;
    try {
      turn = await runChatTurn({ history: session.messages, userMessage: message });
    } catch (err) {
      if (err instanceof InterviewProcessingError) {
        console.error("[interview/chat/turn]", err.message, err.cause);
        return NextResponse.json({ error: err.message, session_id: session.id }, { status: 502 });
      }
      throw err;
    }

    const newMessages: ChatMessage[] = [...session.messages];
    if (message) newMessages.push({ role: "user", content: message });
    newMessages.push({ role: "assistant", content: turn.message });
    await updateChatSessionMessages(session.id, newMessages);

    if (turn.type === "question") {
      return NextResponse.json({ session_id: session.id, done: false, message: turn.message });
    }

    // type === "done": 7.2のJSON結果を interview_submissions に保存する。
    const transcript = renderTranscript(newMessages);
    const submission = await createSubmission({
      companyName: session.company_name,
      employeeName: session.employee_name,
      interviewRound: 1,
      transcript,
      result: { ...turn.result, re_questions: [], interview_round: 1 },
    });

    if (submission) {
      await completeChatSession(session.id, submission.id);
      if (auth.kind === "grant") {
        await linkGrantSubmission(auth.grant.id, submission.id);
      }
    }

    return NextResponse.json({
      session_id: session.id,
      done: true,
      message: turn.message,
      submission_id: submission?.id ?? null,
    });
  } catch (err) {
    if (err instanceof SubmissionsUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[interview/chat/turn] unexpected error", err);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}

/** 保存用に、会話履歴を人が読める文字起こし風のテキストに変換する。 */
function renderTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m) => `${m.role === "assistant" ? "AI" : "対象者"}: ${m.content}`)
    .join("\n");
}
