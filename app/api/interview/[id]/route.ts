import { NextRequest, NextResponse } from "next/server";
import { InterviewResultSchema } from "@/lib/schema";
import {
  getSubmission,
  updateSubmissionResult,
  SubmissionsUnavailableError,
} from "@/lib/supabase/submissions";
import { getCurrentAuth, canAccessSubmission } from "@/lib/authServer";

export const runtime = "nodejs";

/**
 * GET /api/interview/[id]
 * 進捗／引継書プレビュー／出力の各画面が、保存済みの処理結果を読み出すためのAPI。
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const submission = await getSubmission(params.id);
    if (!submission) {
      return NextResponse.json({ error: "指定されたインタビュー結果が見つかりません" }, { status: 404 });
    }
    const auth = await getCurrentAuth();
    if (!canAccessSubmission(auth, submission.id)) {
      return NextResponse.json({ error: "指定されたインタビュー結果が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ submission });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /api/interview/[id]
 * 引継書プレビュー画面で本人が修正した内容（仕様書7.2のJSON形式）を保存する。
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして解釈できません" }, { status: 400 });
  }

  const parsed = InterviewResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "リクエストが不正です", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const existing = await getSubmission(params.id);
    if (!existing) {
      return NextResponse.json({ error: "指定されたインタビュー結果が見つかりません" }, { status: 404 });
    }
    const auth = await getCurrentAuth();
    if (!canAccessSubmission(auth, existing.id)) {
      return NextResponse.json({ error: "指定されたインタビュー結果が見つかりません" }, { status: 404 });
    }
    const submission = await updateSubmissionResult(params.id, parsed.data);
    return NextResponse.json({ submission });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof SubmissionsUnavailableError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  console.error("[interview/[id]]", err);
  return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
}
