"use client";

import { useMemo, useState } from "react";
import type { Business, SuccessorReviewItem, SuccessorReviewStatus } from "@/lib/schema";

export function SuccessorReviewClient({
  code,
  companyName,
  employeeName,
  businesses,
  initialItems,
  initialStatus,
  initialOverallComment,
}: {
  code: string;
  companyName: string | null;
  employeeName: string | null;
  businesses: Business[];
  initialItems: SuccessorReviewItem[];
  initialStatus: SuccessorReviewStatus;
  initialOverallComment: string | null;
}) {
  const [items, setItems] = useState<SuccessorReviewItem[]>(initialItems);
  const [status, setStatus] = useState<SuccessorReviewStatus>(initialStatus);
  const [overallComment, setOverallComment] = useState(initialOverallComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savingBusiness, setSavingBusiness] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const itemByName = useMemo(() => {
    const map = new Map<string, SuccessorReviewItem>();
    for (const item of items) map.set(item.business_name, item);
    return map;
  }, [items]);

  const confirmedCount = items.filter((i) => i.status === "confirmed").length;
  const questionCount = items.filter((i) => i.status === "question").length;
  const unreviewedCount = items.filter((i) => i.status === "unreviewed").length;

  async function submitItem(businessName: string, next: { status: "confirmed" | "question"; question?: string }) {
    setSavingBusiness(businessName);
    setError(null);
    try {
      const res = await fetch(`/api/successor/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "item",
          business_name: businessName,
          status: next.status,
          question: next.question ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setItems(data.review.items);
      setStatus(data.review.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setSavingBusiness(null);
    }
  }

  async function finishReview() {
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/successor/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", overall_comment: overallComment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setStatus(data.review.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
      <h1>後任者確認</h1>
      <p style={{ color: "#555" }}>
        {companyName ?? "会社名未設定"} / {employeeName ?? "対象者未設定"} さんが作成した引継書です。
        1業務ずつ目を通し、「これで対応できる」か「質問がある」かを教えてください。ここで挙がった質問は、
        {employeeName ?? "前任者"}さんの在籍中に回答してもらえるようにします。
      </p>

      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "10px 14px",
          borderRadius: 6,
          marginBottom: 20,
          background: "#eef3f8",
          fontSize: 14,
        }}
      >
        <span>対象業務: {items.length}件</span>
        <span style={{ color: "#2e7d32" }}>対応できる: {confirmedCount}</span>
        <span style={{ color: "#b36b00" }}>質問あり: {questionCount}</span>
        <span style={{ color: "#666" }}>未確認: {unreviewedCount}</span>
      </div>

      {status === "completed" && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            marginBottom: 20,
            background: "#e8f5e9",
            color: "#2e7d32",
            fontWeight: "bold",
          }}
        >
          ✓ 確認完了として送信済みです。内容を追加で確認・修正しても構いません。
        </div>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {businesses.map((business, i) => {
        const item = itemByName.get(business.name);
        return (
          <BusinessReviewCard
            key={i}
            business={business}
            item={item}
            saving={savingBusiness === business.name}
            onConfirm={() => submitItem(business.name, { status: "confirmed" })}
            onAskQuestion={(question) => submitItem(business.name, { status: "question", question })}
          />
        );
      })}

      <section style={{ marginTop: 28, padding: 16, background: "#f7f7f7", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>全体を通しての感想・懸念（任意）</h2>
        <textarea
          value={overallComment}
          onChange={(e) => setOverallComment(e.target.value)}
          rows={4}
          style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          placeholder="例：全体的には対応できそうですが、決算関連の業務は不安が残ります。"
        />
        <button
          type="button"
          onClick={finishReview}
          disabled={finishing}
          style={{ marginTop: 10, padding: "8px 16px" }}
        >
          {finishing ? "送信中..." : "この内容で確認完了を送信する"}
        </button>
      </section>
    </main>
  );
}

function BusinessReviewCard({
  business,
  item,
  saving,
  onConfirm,
  onAskQuestion,
}: {
  business: Business;
  item: SuccessorReviewItem | undefined;
  saving: boolean;
  onConfirm: () => void;
  onAskQuestion: (question: string) => void;
}) {
  const [questionDraft, setQuestionDraft] = useState(item?.question ?? "");
  const [showQuestionBox, setShowQuestionBox] = useState(item?.status === "question");

  const statusBadge =
    item?.status === "confirmed"
      ? { text: "✅ 対応できる", color: "#2e7d32" }
      : item?.status === "question"
        ? { text: "❓ 質問あり", color: "#b36b00" }
        : { text: "⬜ 未確認", color: "#999" };

  return (
    <details
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        marginBottom: 12,
        padding: "10px 14px",
      }}
      open={item?.status !== "confirmed"}
    >
      <summary style={{ cursor: "pointer", fontWeight: "bold" }}>
        {business.name}
        {business.business_type && (
          <span style={{ fontWeight: "normal", color: "#777", marginLeft: 8, fontSize: 12 }}>
            （{business.business_type === "contextual" ? "企画系：状況に応じた判断が中心" : "管理系：定型的な手順"}）
          </span>
        )}
        <span style={{ marginLeft: 10, fontSize: 13, color: statusBadge.color }}>{statusBadge.text}</span>
      </summary>

      <div style={{ marginTop: 12 }}>
        <Field label="目的・対象" value={business.purpose} />
        <Field label="頻度・実施時期" value={business.frequency} />
        <Field label="開始条件" value={business.trigger} />
        <Field label="期限" value={business.deadline} />
        <Field
          label={business.business_type === "contextual" ? "進め方（典型パターン）" : "具体的手順"}
          value={business.steps.length ? business.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : null}
          multiline
        />
        <Field label="成果物・保存場所" value={business.deliverables} />
        <Field label="判断ポイント" value={business.judgment} />
        <Field label="例外・イレギュラー対応" value={business.exception} />
        <Field label="失敗時対応" value={business.failure} />
        <Field
          label="関係者"
          value={
            business.stakeholders.length
              ? business.stakeholders
                  .map((s) => `${s.role}: ${s.name}${s.note ? `（${s.note}）` : ""}`)
                  .join(" / ")
              : null
          }
        />
        <Field label="使用ファイル・システム" value={business.systems} />
        {business.system_details.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: "bold", fontSize: 13 }}>システムごとの詳細</span>
            {business.system_details.map((sys, j) => (
              <div key={j} style={{ fontSize: 13, marginTop: 4, paddingLeft: 12, borderLeft: "2px solid #eee" }}>
                <strong>{sys.name}</strong>
                {[
                  ["URL", sys.url],
                  ["ログインID", sys.login_id],
                  ["利用機能・ログイン方法", sys.login_method],
                  ["権限", sys.permission],
                  ["端末制限", sys.device_restriction],
                  ["電子証明書", sys.certificate],
                  ["申請先", sys.application_destination],
                  ["代理者", sys.proxy],
                  ["マニュアル保管場所", sys.manual_location],
                  ["関連ファイル保存場所", sys.file_location],
                  ["備考", sys.note],
                ]
                  .filter(([, v]) => v && String(v).trim().length > 0)
                  .map(([label, value], k) => (
                    <div key={k}>
                      {label}: {value}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
        <Field label="権限移管状況" value={business.access_handover} />

        {item?.answer && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "#eef7ee",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <strong>質問: </strong>
            {item.question}
            <br />
            <strong>回答: </strong>
            {item.answer}
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button type="button" onClick={onConfirm} disabled={saving} style={{ padding: "6px 12px" }}>
            ✅ これで対応できます
          </button>
          <button
            type="button"
            onClick={() => setShowQuestionBox((v) => !v)}
            disabled={saving}
            style={{ padding: "6px 12px" }}
          >
            ❓ 質問がある
          </button>
        </div>

        {showQuestionBox && (
          <div style={{ marginTop: 8 }}>
            <textarea
              value={questionDraft}
              onChange={(e) => setQuestionDraft(e.target.value)}
              rows={2}
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              placeholder="例：申請フォームの保存場所が分かりません。どこにありますか？"
            />
            <button
              type="button"
              onClick={() => onAskQuestion(questionDraft)}
              disabled={saving || !questionDraft.trim()}
              style={{ marginTop: 6, padding: "6px 12px" }}
            >
              この質問を送信
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function Field({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  if (!value || value.trim().length === 0) return null;
  return (
    <div style={{ marginBottom: 6, fontSize: 13.5 }}>
      <strong>{label}: </strong>
      {multiline ? <div style={{ whiteSpace: "pre-wrap" }}>{value}</div> : value}
    </div>
  );
}
