import { NextRequest, NextResponse } from "next/server";
import { getSubmission, SubmissionsUnavailableError, appendBusinessFollowUpNote } from "@/lib/supabase/submissions";
import {
  createSuccessorReview,
  listSuccessorReviewsForSubmission,
  answerSuccessorReviewItem,
  getSuccessorReviewById,
  markSuccessorReviewItemReflected,
} from "@/lib/successorReviews";
import { getCurrentAuth, canAccessSubmission } from "@/lib/authServer";

export const runtime = "nodejs";

/**
 * GET  /api/interview/[id]/successor-review
 *   この引継書に対して発行済みの後任者確認レコード一覧を返す（進捗画面用）。
 * POST /api/interview/[id]/successor-review
 *   後任者確認用のコード（専用リンク）を新規発行する。
 * PATCH /api/interview/[id]/successor-review
 *   前任者・運営者が、後任者からの質問に回答する（action省略時、既定）。
 *   action: "reflect" の場合、回答済みの質問を引継書本文（human_follow_up_note）へ
 *   追記し、reflected フラグを立てる（改善計画フェーズ0・提案Q29）。
 *   未完了案件（kind: "unfinished_case"）には本文への反映先フィールドが無いため対象外。
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
    if (submission.result.businesses.length === 0 && submission.result.unfinished_cases.length === 0) {
      return NextResponse.json(
        { error: "業務・未完了案件が1件も登録されていないため、後任者確認を発行できません" },
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
      items: [
        ...submission.result.businesses.map((b) => ({ name: b.name, kind: "business" as const })),
        ...submission.result.unfinished_cases.map((c) => ({
          name: c.name,
          kind: "unfinished_case" as const,
        })),
      ],
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

    const { review_id, business_name, kind, answer, action } = (body ?? {}) as {
      review_id?: string;
      business_name?: string;
      kind?: "business" | "unfinished_case";
      answer?: string;
      action?: "answer" | "reflect";
    };
    if (!review_id || !business_name) {
      return NextResponse.json({ error: "review_id・business_name は必須です" }, { status: 400 });
    }

    if (action === "reflect") {
      if ((kind ?? "business") !== "business") {
        return NextResponse.json(
          { error: "未完了案件の質問は現時点で引継書本文への反映に対応していません" },
          { status: 400 }
        );
      }

      const existing = await getSuccessorReviewById(review_id);
      const item = existing?.items.find(
        (i) => i.business_name === business_name && (i.kind ?? "business") === "business"
      );
      if (!item || item.status !== "question" || !item.answer) {
        return NextResponse.json(
          { error: "反映できる回答済みの質問が見つかりません" },
          { status: 400 }
        );
      }

      await appendBusinessFollowUpNote(
        params.id,
        business_name,
        `後任者からの質問「${item.question ?? ""}」→ 回答: ${item.answer}`
      );
      const review = await markSuccessorReviewItemReflected({
        reviewId: review_id,
        businessName: business_name,
        kind: "business",
      });
      return NextResponse.json({ review });
    }

    if (!answer?.trim()) {
      return NextResponse.json({ error: "answer は必須です" }, { status: 400 });
    }

    const review = await answerSuccessorReviewItem({
      reviewId: review_id,
      businessName: business_name,
      kind,
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
