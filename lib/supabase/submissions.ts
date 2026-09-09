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
