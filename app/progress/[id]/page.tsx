import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import { computeCategoryBreakdown, isHandoverComplete } from "@/lib/scoring";
import { getCurrentAuth, canAccessSubmission } from "@/lib/authServer";

/**
 * 仕様書8章 画面3「進捗」。
 * 業務ごとの充足率スコアと、カテゴリ別（8カテゴリ・配点100点）の充足率を表示する。
 * 必須ゲート（重要項目の未確認）が1件でも残っている業務があれば、総合点にかかわらず
 * 「引継未完了」であることを明示する（6章・改善方針12章）。
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

  const auth = await getCurrentAuth();
  if (!canAccessSubmission(auth, submission.id)) notFound();

  const { result } = submission;
  const breakdown = computeCategoryBreakdown(result.businesses);
  const hasFollowUps = result.businesses.some((b) => b.human_follow_up_note);
  const hasReQuestions = result.re_questions.length > 0;
  const handoverComplete = result.businesses.length > 0 && isHandoverComplete(result.businesses);
  const gateFailedBusinesses = result.businesses.filter((b) => b.mandatory_gate_missing.length > 0);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>進捗</h1>
      <p style={{ color: "#555" }}>
        {submission.company_name ?? "会社名未設定"} / {submission.employee_name ?? "対象者未設定"}
        （インタビュー {submission.interview_round} 回目）
      </p>

      <div
        style={{
          padding: "10px 14px",
          borderRadius: 6,
          marginBottom: 20,
          fontWeight: "bold",
          background: handoverComplete ? "#e8f5e9" : "#fdecea",
          color: handoverComplete ? "#2e7d32" : "#c62828",
        }}
      >
        {handoverComplete ? "✓ 必須ゲートを満たしています（引継完了の要件を充足）" : "✗ 引継未完了（必須項目が未確認の業務があります）"}
      </div>

      {gateFailedBusinesses.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2>必須ゲート未達の業務</h2>
          <ul>
            {gateFailedBusinesses.map((b, i) => (
              <li key={i}>
                <strong>{b.name}</strong>: {b.mandatory_gate_missing.join("、")} が未確認
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2>全体充足率</h2>
        <ScoreBar label="総合" value={submission.overall_score} />
        {breakdown.map((c) => (
          <ScoreBar key={c.key} label={`${c.label}（配点${c.weight}）`} value={c.rate} />
        ))}
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
