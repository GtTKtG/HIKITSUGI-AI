import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import {
  SuccessorReviewItemSchema,
  type SuccessorReviewItem,
  type SuccessorReviewStatus,
} from "@/lib/schema";

/**
 * 後任者による再現性確認（仕様書5.3）。
 *
 * 前任者の退職前に、後任者へ専用リンク（コード）を発行し、業務ごとに
 * 「これで対応できる／質問がある」を確認してもらう。質問は前任者・運営者が
 * 在籍中に回答できるよう、同じレコード（successor_reviews.items）に蓄積する。
 * access_grants と同じ「固有コードでゲートする」設計を踏襲している。
 */

const ItemsArraySchema = z.array(SuccessorReviewItemSchema);

export interface SuccessorReviewRow {
  id: string;
  submission_id: string;
  code: string;
  successor_name: string | null;
  status: SuccessorReviewStatus;
  items: SuccessorReviewItem[];
  overall_comment: string | null;
  created_at: string;
  updated_at: string;
}

// access_grants と同様、見間違えやすい文字を除いた英数字コード。
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

function parseRow(data: Record<string, unknown>): SuccessorReviewRow {
  const items = ItemsArraySchema.parse(data.items ?? []);
  return { ...data, items } as SuccessorReviewRow;
}

/** 提出済みの引継書1件に対して、後任者確認レコードを新規発行する。 */
export async function createSuccessorReview(params: {
  submissionId: string;
  successorName?: string | null;
  businessNames: string[];
}): Promise<SuccessorReviewRow> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const items: SuccessorReviewItem[] = params.businessNames.map((name) => ({
    business_name: name,
    status: "unreviewed",
    question: null,
    answer: null,
    answered_at: null,
  }));

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from("successor_reviews")
      .insert({
        submission_id: params.submissionId,
        code,
        successor_name: params.successorName ?? null,
        items,
      })
      .select("*")
      .single();

    if (!error) return parseRow(data);
    if (!isUniqueViolation(error)) throw error;
  }
  throw new Error("後任者確認用コードの生成に失敗しました（衝突が続いたため）");
}

export async function getSuccessorReviewByCode(code: string): Promise<SuccessorReviewRow | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("successor_reviews")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return parseRow(data);
}

export async function getSuccessorReviewById(id: string): Promise<SuccessorReviewRow | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("successor_reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return parseRow(data);
}

export async function listSuccessorReviewsForSubmission(
  submissionId: string
): Promise<SuccessorReviewRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("successor_reviews")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(parseRow);
}

/** 後任者が1件の業務について「対応できる／質問がある」を記録する。 */
export async function updateSuccessorReviewItem(params: {
  code: string;
  businessName: string;
  status: "confirmed" | "question";
  question?: string | null;
}): Promise<SuccessorReviewRow> {
  const review = await getSuccessorReviewByCode(params.code);
  if (!review) throw new Error("指定された後任者確認が見つかりません");

  const items = review.items.map((item) =>
    item.business_name === params.businessName
      ? {
          ...item,
          status: params.status,
          question: params.status === "question" ? params.question ?? null : null,
        }
      : item
  );

  const nextStatus: SuccessorReviewStatus = review.status === "pending" ? "in_progress" : review.status;
  return persistReview(review.id, { items, status: nextStatus });
}

/** 前任者・運営者が、後任者からの質問に回答する。 */
export async function answerSuccessorReviewItem(params: {
  reviewId: string;
  businessName: string;
  answer: string;
}): Promise<SuccessorReviewRow> {
  const review = await getSuccessorReviewById(params.reviewId);
  if (!review) throw new Error("指定された後任者確認が見つかりません");

  const items = review.items.map((item) =>
    item.business_name === params.businessName
      ? { ...item, answer: params.answer, answered_at: new Date().toISOString() }
      : item
  );

  return persistReview(review.id, { items });
}

/** 後任者が全業務の確認を終え、任意のコメントとともに確認完了とする。 */
export async function completeSuccessorReview(params: {
  code: string;
  overallComment?: string | null;
  successorName?: string | null;
}): Promise<SuccessorReviewRow> {
  const review = await getSuccessorReviewByCode(params.code);
  if (!review) throw new Error("指定された後任者確認が見つかりません");

  return persistReview(review.id, {
    status: "completed",
    overall_comment: params.overallComment ?? review.overall_comment,
    successor_name: params.successorName ?? review.successor_name,
  });
}

async function persistReview(
  id: string,
  patch: Partial<
    Pick<SuccessorReviewRow, "items" | "status" | "overall_comment" | "successor_name">
  >
): Promise<SuccessorReviewRow> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("successor_reviews")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return parseRow(data);
}
