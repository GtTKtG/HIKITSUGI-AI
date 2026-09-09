import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import { computeCategoryBreakdown } from "@/lib/scoring";

/**
 * 仕様書8章 画面3「進捗」。
 * 業務ごとの充足率スコアと、カテゴリ別（業務把握／判断基準／例外対応）の
 * 充足率を表示する（仕様書の表示例：業務把握100％、判断基準70％、例外対応40％）。
 */
export default async function ProgressPage({ params }: { params: { id: string } }) {
  let submission;
  try {
    submission = await getSubmission(params.id);
  } catch (err) {
    if (err instanceof SubmissionsUnavailableError) {
      return <UnavailableNotice message={err.message} />;
    }
    throw err;
  }

  if (!submission) notFound();

  const { result } = submission;
  const breakdown = computeCategoryBreakdown(result.businesses);
  const hasFollowUps = result.businesses.some((b) => b.human_follow_up_note);
  const hasReQuestions = result.re_questions.length > 0;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>進捗</h1>
      <p style={{ color: "#555" }}>
        {submission.company_name ?? "会社名未設定"} / {submission.employee_name ?? "対象者未設定"}
        （インタビュー {submission.interview_round} 回目）
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2>全体充足率</h2>
        <ScoreBar label="総合" value={submission.overall_score} />
        <ScoreBar label="業務把握（頻度・開始条件・手順・関係者・使用ファイル）" value={breakdown.businessGrasp} />
        <ScoreBar label="判断基準" value={breakdown.judgmentCriteria} />
        <ScoreBar label="例外対応（例外・失敗時対応）" value={breakdown.exceptionHandling} />
      </section>

      {hasReQuestions && (
        <section style={{ marginBottom: 24 }}>
          <h2>再質問が必要な項目</h2>
          <ul>
            {result.re_questions.map((q, i) => (
              <li key={i}>
                <strong>{q.business}</strong>（{q.item}）: {q.question}
              </li>
            ))}
          </ul>
          <p style={{ color: "#555" }}>
            対象者への追加確認後、「AIインタビュー」画面からインタビュー回数を増やして再送してください
            （最大3回、6.4節）。
          </p>
        </section>
      )}

      {hasFollowUps && (
        <section style={{ marginBottom: 24 }}>
          <h2>要人間フォロー</h2>
          <ul>
            {result.businesses
              .filter((b) => b.human_follow_up_note)
              .map((b, i) => (
                <li key={i}>
                  <strong>{b.name}</strong>: {b.human_follow_up_note}
                </li>
              ))}
          </ul>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2>業務別スコア</h2>
        <ul>
          {result.businesses.map((b, i) => (
            <li key={i}>
              {b.name}: {b.score}%
              {b.insufficient_items.length > 0 && (
                <span style={{ color: "#b36b00" }}> （不足: {b.insufficient_items.join(", ")}）</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <nav style={{ display: "flex", gap: 12 }}>
        <Link href={`/preview/${submission.id}`}>引継書プレビューへ</Link>
        <Link href="/interview">AIインタビューに戻る</Link>
      </nav>
    </main>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const pct = value ?? 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
        <span>{label}</span>
        <span>{value == null ? "-" : `${value}%`}</span>
      </div>
      <div style={{ background: "#eee", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            background: pct >= 80 ? "#2e7d32" : pct >= 50 ? "#f9a825" : "#c62828",
            height: "100%",
          }}
        />
      </div>
    </div>
  );
}

function UnavailableNotice({ message }: { message: string }) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>進捗</h1>
      <p style={{ color: "crimson" }}>{message}</p>
    </main>
  );
}
