import { NextRequest, NextResponse } from "next/server";
import { createGrant, listGrants } from "@/lib/grants";
import { SubmissionsUnavailableError } from "@/lib/supabase/submissions";

export const runtime = "nodejs";

// このルート自体は middleware.ts で /api/admin/* として運営者用マスターコード
// 必須のパスに指定済みのため、ここでは追加の認可チェックは行っていない。

export async function GET() {
  try {
    const grants = await listGrants();
    return NextResponse.json({ grants });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして解釈できません" }, { status: 400 });
  }

  const companyName = typeof (body as { company_name?: unknown })?.company_name === "string"
    ? (body as { company_name: string }).company_name
    : undefined;
  const employeeName = typeof (body as { employee_name?: unknown })?.employee_name === "string"
    ? (body as { employee_name: string }).employee_name
    : undefined;

  try {
    const grant = await createGrant({ companyName, employeeName });
    return NextResponse.json({ grant });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof SubmissionsUnavailableError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  console.error("[admin/grants]", err);
  return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
}
