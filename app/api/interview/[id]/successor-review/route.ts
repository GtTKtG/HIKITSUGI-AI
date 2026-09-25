import { NextRequest, NextResponse } from "next/server";
import { getSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import {
  createSuccessorReview,
  listSuccessorReviewsForSubmission,
  answerSuccessorReviewItem,
} from "@/lib/successorReviews";
import { getCurrentAuth, canAccessSubmission } from "@/lib/authServer";

export const runtime = "nodejs";

/**
 * GET  /api/interview/[id]/successor-review
 *   この引継書に対して発行済みの後任者確認レコード一覧を返す（進捗画面用）。
 * POST /api/interview/[id]/successor-review
 *   後任者確認用のコード（専用リンク）を新規発行する。
 * PATCH /api/interview/[id]/successor-review
 *   前任者・運営者が、後任者からの質問に回答する。
 *
 * 管理者（運営者マスターコード）または、この案件に紐づく顧客固有コード（grant）
 * からのみ操作できる（他人の案件の後任者確認を覗き見・発行できないようにする）。
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getCurrentAuth();
    if (!canAccessSubmission(auth, params.id)) {
      return NextResponse.json({ error: "アクセスできません" }, { status: 403 });
    }

    const reviews = await listSuccessorReviewsForSubmission(params.id);
    return NextResponse.json({ reviews });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getCurrentAuth();
    if (!canAccessSubmission(auth, params.id)) {
      return NextResponse.json({ error: "アクセスできません" }, { status: 403 });
    }

    const submission = await getSubmission(params.id);
    if (!submission) {
      return NextResponse.json({ error: "指定された引継書が見つかりません" }, { status: 404 });
    }
    if (submission.result.businesses.length === 0) {
      return NextResponse.json(
        { error: "業務が1件も登録されていないため、後任者確認を発行できません" },
        { status: 400 }
      );
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      // ボディなし（successor_name未指定）でも許容する
    }
    const successorName =
      typeof (body as { successor_name?: unknown })?.successor_name === "string"
        ? (body as { successor_name: string }).successor_name
        : null;

    const review = await createSuccessorReview({
      submissionId: submission.id,
      successorName,
      businessNames: submission.result.businesses.map((b) => b.name),
    });

    return NextResponse.json({ review });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getCurrentAuth();
    if (!canAccessSubmission(auth, params.id)) {
      return NextResponse.json({ error: "アクセスできません" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "リクエストボディがJSONとして解釈できません" }, { status: 400 });
    }

    const { review_id, business_name, answer } = (body ?? {}) as {
      review_id?: string;
      business_name?: string;
      answer?: string;
    };
    if (!review_id || !business_name || !answer?.trim()) {
      return NextResponse.json(
        { error: "review_id・business_name・answer は必須です" },
        { status: 400 }
      );
    }

    const review = await answerSuccessorReviewItem({
      reviewId: review_id,
      businessName: business_name,
      answer,
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
  console.error("[interview/successor-review]", err);
  return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
}
