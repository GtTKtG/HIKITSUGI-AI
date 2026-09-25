import { NextRequest, NextResponse } from "next/server";
import {
  getSuccessorReviewByCode,
  updateSuccessorReviewItem,
  completeSuccessorReview,
} from "@/lib/successorReviews";
import { getSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";

export const runtime = "nodejs";

/**
 * 後任者向けの公開エンドポイント（仕様書5.3）。
 * 顧客固有コード（access_grants）と同様、固有コードそのものをゲートとして使う
 * （middleware.ts の PUBLIC_PATHS で認証Cookie不要にしている）。
 *
 * GET  /api/successor/[code]  … 確認対象の引継書内容と、これまでの確認状況を返す
 * POST /api/successor/[code]  … 業務1件の確認結果を記録する、または確認完了を記録する
 */
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const review = await getSuccessorReviewByCode(params.code);
    if (!review) {
      return NextResponse.json({ error: "指定されたリンクは無効です" }, { status: 404 });
    }

    const submission = await getSubmission(review.submission_id);
    if (!submission) {
      return NextResponse.json({ error: "対象の引継書が見つかりません" }, { status: 404 });
    }

    return NextResponse.json({
      review,
      submission: {
        id: submission.id,
        company_name: submission.company_name,
        employee_name: submission.employee_name,
        businesses: submission.result.businesses,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "リクエストボディがJSONとして解釈できません" }, { status: 400 });
    }

    const payload = body as {
      action?: "item" | "complete";
      business_name?: string;
      status?: "confirmed" | "question";
      question?: string;
      overall_comment?: string;
      successor_name?: string;
    };

    if (payload.action === "complete") {
      const review = await completeSuccessorReview({
        code: params.code,
        overallComment: payload.overall_comment ?? null,
        successorName: payload.successor_name ?? null,
      });
      return NextResponse.json({ review });
    }

    if (!payload.business_name || (payload.status !== "confirmed" && payload.status !== "question")) {
      return NextResponse.json(
        { error: "business_name・status（confirmed または question）は必須です" },
        { status: 400 }
      );
    }
    if (payload.status === "question" && !payload.question?.trim()) {
      return NextResponse.json({ error: "質問内容を入力してください" }, { status: 400 });
    }

    const review = await updateSuccessorReviewItem({
      code: params.code,
      businessName: payload.business_name,
      status: payload.status,
      question: payload.question ?? null,
    });
    return NextResponse.json({ review });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof SubmissionsUnavailableError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  console.error("[api/successor]", err);
  return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
}
