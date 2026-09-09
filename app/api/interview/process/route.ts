import { NextRequest, NextResponse } from "next/server";
import { ProcessInterviewRequestSchema } from "@/lib/schema";
import { processInterviewTranscript, InterviewProcessingError } from "@/lib/anthropic";
import { computeOverallScore } from "@/lib/scoring";
import { createSubmission } from "@/lib/supabase/submissions";

export const runtime = "nodejs";

/**
 * POST /api/interview/process
 *
 * バッチ版AIインタビュー（新仕様書7.3「モニター期間の代替運用」）。
 * 文字起こし本文（＋インタビュー回数）を受け取り、Claude に構造化させ、
 * DB接続が設定されていれば結果を保存し、フロントエンドにJSONを返す。
 * チャット版（/api/interview/chat/turn）が本線だが、こちらも並行して残す。
 *
 * 再質問後の2回目・3回目は、interview_round をインクリメントして同じ形式で
 * 再送する（呼び出し側の責務）。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして解釈できません" }, { status: 400 });
  }

  const parsedRequest = ProcessInterviewRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "リクエストが不正です", details: parsedRequest.error.flatten() },
      { status: 400 }
    );
  }

  const { transcript, interview_round, company_name, employee_name } = parsedRequest.data;

  let result;
  try {
    result = await processInterviewTranscript({
      transcript,
      interviewRound: interview_round,
    });
  } catch (err) {
    if (err instanceof InterviewProcessingError) {
      console.error("[interview/process]", err.message, err.cause);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[interview/process] unexpected error", err);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }

  let submissionId: string | null = null;
  try {
    const submission = await createSubmission({
      companyName: company_name,
      employeeName: employee_name,
      interviewRound: interview_round,
      transcript,
      result,
    });
    submissionId = submission?.id ?? null;
  } catch (err) {
    // DB保存に失敗しても、解析結果自体はフロントエンドへ返す（保存は付随機能）。
    console.error("[interview/process] failed to persist submission", err);
  }

  return NextResponse.json({
    submission_id: submissionId,
    overall_score: computeOverallScore(result.businesses.map((b) => b.score)),
    result,
  });
}
