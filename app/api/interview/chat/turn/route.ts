import { NextRequest, NextResponse } from "next/server";
import { ChatTurnRequestSchema, type ChatMessage } from "@/lib/schema";
import { runChatTurn, InterviewProcessingError } from "@/lib/anthropic";
import {
  createChatSession,
  getChatSession,
  updateChatSessionMessages,
  completeChatSession,
} from "@/lib/supabase/chatSessions";
import { createSubmission } from "@/lib/supabase/submissions";
import { SubmissionsUnavailableError } from "@/lib/supabase/submissions";

export const runtime = "nodejs";

/**
 * POST /api/interview/chat/turn
 *
 * チャット版AIインタビュー（新仕様書5章・7.1・7.2）の1ターンを処理する。
 *
 * - session_id を渡さない最初の呼び出しで新しいセッションを作成し、AIからの
 *   最初の質問を返す。
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
    const session = session_id
      ? await getChatSession(session_id)
      : await createChatSession({ companyName: company_name, employeeName: employee_name });

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
