import { NextRequest, NextResponse } from "next/server";
import { getSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import { buildHandoverDocx } from "@/lib/export/docx";
import { buildHandoverPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";

const FORMATS = ["docx", "pdf"] as const;
type Format = (typeof FORMATS)[number];

/**
 * GET /api/interview/[id]/export?format=docx|pdf
 *
 * 仕様書8章「出力」画面に対応。引継書プレビューで確定した内容を
 * Word（.docx）またはPDFとしてダウンロードする。
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const formatParam = req.nextUrl.searchParams.get("format") ?? "docx";
  if (!FORMATS.includes(formatParam as Format)) {
    return NextResponse.json({ error: `format は ${FORMATS.join(" / ")} のいずれかを指定してください` }, { status: 400 });
  }
  const format = formatParam as Format;

  let submission;
  try {
    submission = await getSubmission(params.id);
  } catch (err) {
    if (err instanceof SubmissionsUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[interview/[id]/export]", err);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }

  if (!submission) {
    return NextResponse.json({ error: "指定されたインタビュー結果が見つかりません" }, { status: 404 });
  }

  const baseName = submission.employee_name
    ? `引継書_${submission.employee_name}`
    : `引継書_${submission.id.slice(0, 8)}`;

  try {
    if (format === "docx") {
      const buffer = await buildHandoverDocx({
        companyName: submission.company_name,
        employeeName: submission.employee_name,
        result: submission.result,
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName)}.docx"`,
        },
      });
    }

    const buffer = await buildHandoverPdf({
      companyName: submission.company_name,
      employeeName: submission.employee_name,
      result: submission.result,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName)}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[interview/[id]/export] generation failed", err);
    return NextResponse.json({ error: "出力ファイルの生成に失敗しました" }, { status: 500 });
  }
}
