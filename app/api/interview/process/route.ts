import { NextRequest, NextResponse } from "next/server";
import { ProcessInterviewRequestSchema } from "@/lib/schema";
import { processInterviewTranscript, InterviewProcessingError } from "@/lib/anthropic";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { computeOverallScore } from "@/lib/scoring";

export const runtime = "nodejs";

/**
 * POST /api/interview/process
 *
 * 仕様書 7.3 の「バックエンドサーバー」に相当する唯一のエンドポイント（優先順位1）。
 * 文字起こし本文（＋インタビュー回数）を受け取り、Claude に構造化させ、
 * DB接続が設定されていれば結果を保存し、フロントエンドにJSONを返す。
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

  const overallScore = computeOverallScore(result.businesses.map((b) => b.score));

  const supabase = getSupabaseServerClient();
  let submissionId: string | null = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("interview_submissions")
      .insert({
        company_name: company_name ?? null,
        employee_name: employee_name ?? null,
        interview_round,
        transcript,
        result,
        overall_score: overallScore,
      })
      .select("id")
      .single();

    if (error) {
      // DB保存に失敗しても、解析結果自体はフロントエンドへ返す（保存は付随機能）。
      console.error("[interview/process] failed to persist submission", error);
    } else {
      submissionId = data?.id ?? null;
    }
  }

  return NextResponse.json({
    submission_id: submissionId,
    overall_score: overallScore,
    result,
  });
}
