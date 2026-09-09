import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";

/**
 * 仕様書8章 画面5「出力」。
 * 引継書プレビューで確定した内容を Word / PDF でダウンロードする。
 */
export default async function ExportPage({ params }: { params: { id: string } }) {
  let submission;
  try {
    submission = await getSubmission(params.id);
  } catch (err) {
    if (err instanceof SubmissionsUnavailableError) {
      return (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
          <h1>出力</h1>
          <p style={{ color: "crimson" }}>{err.message}</p>
        </main>
      );
    }
    throw err;
  }

  if (!submission) notFound();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>出力</h1>
      <p style={{ color: "#555" }}>
        {submission.company_name ?? "会社名未設定"} / {submission.employee_name ?? "対象者未設定"}
        の引継書を出力します。
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <a
          href={`/api/interview/${submission.id}/export?format=docx`}
          style={buttonStyle}
        >
          Word（.docx）でダウンロード
        </a>
        <a href={`/api/interview/${submission.id}/export?format=pdf`} style={buttonStyle}>
          PDFでダウンロード
        </a>
      </div>

      <p style={{ fontSize: 13, color: "#777" }}>
        内容を修正する場合は
        <Link href={`/preview/${submission.id}`}>引継書プレビュー</Link>
        に戻って保存してから再度出力してください。
      </p>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 16px",
  background: "#2e7d32",
  color: "#fff",
  borderRadius: 6,
  textDecoration: "none",
};
