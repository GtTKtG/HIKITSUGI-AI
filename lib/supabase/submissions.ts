import { getSupabaseServerClient } from "@/lib/supabase/server";
import { InterviewResultSchema, type InterviewResult } from "@/lib/schema";
import { computeOverallScore } from "@/lib/scoring";

export interface InterviewSubmissionRow {
  id: string;
  company_name: string | null;
  employee_name: string | null;
  interview_round: number;
  transcript: string;
  result: InterviewResult;
  overall_score: number | null;
  created_at: string;
  updated_at: string;
}

export class SubmissionsUnavailableError extends Error {
  constructor() {
    super(
      "Supabase が未設定のため、この画面は利用できません（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定してください）"
    );
    this.name = "SubmissionsUnavailableError";
  }
}

/**
 * 処理済みの結果を interview_submissions に1行保存する。
 * バッチ版（/api/interview/process）・チャット版（/api/interview/chat/turn 完了時）の
 * 両方から使う共通の保存先。DB未設定時は null を返す（呼び出し元で許容する）。
 */
export async function createSubmission(params: {
  companyName?: string | null;
  employeeName?: string | null;
  interviewRound: number;
  transcript: string;
  result: InterviewResult;
}): Promise<InterviewSubmissionRow | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const overallScore = computeOverallScore(params.result.businesses.map((b) => b.score));

  const { data, error } = await supabase
    .from("interview_submissions")
    .insert({
      company_name: params.companyName ?? null,
      employee_name: params.employeeName ?? null,
      interview_round: params.interviewRound,
      transcript: params.transcript,
      result: params.result,
      overall_score: overallScore,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as InterviewSubmissionRow;
}

export async function getSubmission(id: string): Promise<InterviewSubmissionRow | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("interview_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const parsedResult = InterviewResultSchema.safeParse(data.result);
  if (!parsedResult.success) {
    throw new Error(`保存済みの結果データが不正です: ${parsedResult.error.message}`);
  }

  return { ...data, result: parsedResult.data } as InterviewSubmissionRow;
}

export async function updateSubmissionResult(
  id: string,
  result: InterviewResult
): Promise<InterviewSubmissionRow> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const overallScore = computeOverallScore(result.businesses.map((b) => b.score));

  const { data, error } = await supabase
    .from("interview_submissions")
    .update({ result, overall_score: overallScore })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as InterviewSubmissionRow;
}

/**
 * 後任者確認で解決した質問（successor_reviews.items[].answer）を、対象業務の
 * human_follow_up_note に追記する（改善計画フェーズ0・提案Q29）。
 * 現状はデータベースに蓄積されるだけで引継書本文に反映されない「死蔵データ」問題への対応。
 * 該当する業務が見つからない場合は何もしない（呼び出し元でハンドリング）。
 */
export async function appendBusinessFollowUpNote(
  submissionId: string,
  businessName: string,
  noteToAppend: string
): Promise<InterviewSubmissionRow> {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new Error("対象の引継書が見つかりません");

  const businesses = submission.result.businesses.map((b) => {
    if (b.name !== businessName) return b;
    const existing = b.human_follow_up_note;
    const merged = existing && existing.trim().length > 0 ? `${existing}\n${noteToAppend}` : noteToAppend;
    return { ...b, human_follow_up_note: merged };
  });

  return updateSubmissionResult(submissionId, { ...submission.result, businesses });
}
