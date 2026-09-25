"use client";

import { useEffect, useState } from "react";

interface SuccessorReviewItem {
  business_name: string;
  status: "unreviewed" | "confirmed" | "question";
  question: string | null;
  answer: string | null;
  answered_at: string | null;
}

interface SuccessorReviewRow {
  id: string;
  code: string;
  successor_name: string | null;
  status: "pending" | "in_progress" | "completed";
  items: SuccessorReviewItem[];
  overall_comment: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<SuccessorReviewRow["status"], string> = {
  pending: "未着手",
  in_progress: "確認中",
  completed: "確認完了",
};

/**
 * 後任者による再現性確認（仕様書5.3）を、進捗画面から発行・管理するパネル。
 * - 未発行なら専用リンクを発行する
 * - 発行済みなら進捗（対応できる／質問あり件数）と、未回答の質問への回答フォームを出す
 */
export function SuccessorReviewPanel({ submissionId }: { submissionId: string }) {
  const [reviews, setReviews] = useState<SuccessorReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    void loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadReviews() {
    try {
      const res = await fetch(`/api/interview/${submissionId}/successor-review`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setReviews(data.reviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    }
  }

  async function issueReview() {
    setIssuing(true);
    setError(null);
    try {
      const res = await fetch(`/api/interview/${submissionId}/successor-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setReviews((prev) => [data.review, ...(prev ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setIssuing(false);
    }
  }

  async function answerQuestion(reviewId: string, businessName: string, answer: string) {
    setError(null);
    try {
      const res = await fetch(`/api/interview/${submissionId}/successor-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_id: reviewId, business_name: businessName, answer }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setReviews((prev) => (prev ?? []).map((r) => (r.id === reviewId ? data.review : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    }
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <h2>後任者による再現性確認</h2>
      <p style={{ color: "#555", fontSize: 14 }}>
        引継書は完成しましたが、後任者が実際に読んで「これで対応できる」と確認できて初めて引継ぎが
        機能します。在籍中に後任者へ専用リンクを共有し、確認・質問対応を済ませてください。
      </p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {reviews === null ? (
        <p style={{ color: "#999" }}>読み込み中...</p>
      ) : (
        <>
          {reviews.length === 0 && (
            <button type="button" onClick={issueReview} disabled={issuing} style={{ padding: "8px 16px" }}>
              {issuing ? "発行中..." : "後任者確認用リンクを発行する"}
            </button>
          )}

          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              origin={origin}
              onAnswer={(businessName, answer) => answerQuestion(review.id, businessName, answer)}
            />
          ))}

          {reviews.length > 0 && (
            <button
              type="button"
              onClick={issueReview}
              disabled={issuing}
              style={{ marginTop: 10, padding: "6px 12px", fontSize: 13 }}
            >
              {issuing ? "発行中..." : "別の後任者用にもう1つリンクを発行する"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ReviewCard({
  review,
  origin,
  onAnswer,
}: {
  review: SuccessorReviewRow;
  origin: string;
  onAnswer: (businessName: string, answer: string) => void;
}) {
  const confirmed = review.items.filter((i) => i.status === "confirmed").length;
  const questions = review.items.filter((i) => i.status === "question");
  const unanswered = questions.filter((q) => !q.answer);
  const link = origin ? `${origin}/successor/${review.code}` : `/successor/${review.code}`;

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong>{review.successor_name ?? "後任者"}</strong>
          <span style={{ marginLeft: 8, fontSize: 13, color: "#666" }}>{STATUS_LABEL[review.status]}</span>
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>
          対応できる: {confirmed} / 質問: {questions.length} / 全{review.items.length}件
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 13 }}>
        共有用リンク:{" "}
        <a href={link} target="_blank" rel="noreferrer">
          {link}
        </a>
      </div>

      {unanswered.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <strong style={{ fontSize: 13, color: "#b36b00" }}>未回答の質問（{unanswered.length}件）</strong>
          {unanswered.map((q, i) => (
            <QuestionRow key={i} question={q} onAnswer={(answer) => onAnswer(q.business_name, answer)} />
          ))}
        </div>
      )}

      {questions.length > unanswered.length && (
        <div style={{ marginTop: 12 }}>
          <strong style={{ fontSize: 13, color: "#2e7d32" }}>回答済みの質問</strong>
          {questions
            .filter((q) => q.answer)
            .map((q, i) => (
              <div key={i} style={{ fontSize: 13, marginTop: 6, paddingLeft: 10, borderLeft: "2px solid #eee" }}>
                <strong>{q.business_name}</strong>
                <div>Q: {q.question}</div>
                <div>A: {q.answer}</div>
              </div>
            ))}
        </div>
      )}

      {review.overall_comment && (
        <div style={{ marginTop: 12, fontSize: 13, padding: 8, background: "#f7f7f7", borderRadius: 6 }}>
          <strong>後任者からの全体コメント: </strong>
          {review.overall_comment}
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  onAnswer,
}: {
  question: SuccessorReviewItem;
  onAnswer: (answer: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    try {
      await onAnswer(draft);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ fontSize: 13, marginTop: 8, paddingLeft: 10, borderLeft: "2px solid #f0c36d" }}>
      <strong>{question.business_name}</strong>
      <div>Q: {question.question}</div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        style={{ width: "100%", padding: 6, marginTop: 4, boxSizing: "border-box" }}
        placeholder="回答を入力してください"
      />
      <button
        type="button"
        onClick={submit}
        disabled={sending || !draft.trim()}
        style={{ marginTop: 4, padding: "4px 10px", fontSize: 12 }}
      >
        {sending ? "送信中..." : "回答する"}
      </button>
    </div>
  );
}
