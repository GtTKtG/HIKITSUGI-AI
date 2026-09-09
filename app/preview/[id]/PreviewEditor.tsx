"use client";

import { useState } from "react";
import Link from "next/link";
import type { InterviewResult, Business } from "@/lib/schema";
import type { InterviewSubmissionRow } from "@/lib/supabase/submissions";

export function PreviewEditor({ submission }: { submission: InterviewSubmissionRow }) {
  const [result, setResult] = useState<InterviewResult>(submission.result);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function updateBusiness(index: number, patch: Partial<Business>) {
    setResult((prev) => ({
      ...prev,
      businesses: prev.businesses.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  }

  function updateUnfinishedCase(index: number, patch: Partial<InterviewResult["unfinished_cases"][number]>) {
    setResult((prev) => ({
      ...prev,
      unfinished_cases: prev.unfinished_cases.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function removeUnfinishedCase(index: number) {
    setResult((prev) => ({
      ...prev,
      unfinished_cases: prev.unfinished_cases.filter((_, i) => i !== index),
    }));
  }

  function addUnfinishedCase() {
    setResult((prev) => ({
      ...prev,
      unfinished_cases: [
        ...prev.unfinished_cases,
        { name: "", progress: "", next_action: "", deadline: "" },
      ],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/interview/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data.submission.result);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1>引継書プレビュー</h1>
      <p style={{ color: "#555" }}>
        {submission.company_name ?? "会社名未設定"} / {submission.employee_name ?? "対象者未設定"}。
        内容を修正できます。修正後は「保存」を押してください。
      </p>

      {result.businesses.map((business, i) => (
        <fieldset key={i} style={fieldsetStyle}>
          <legend>
            <strong>{business.name}</strong>（充足率: {business.score}%）
          </legend>
          <TextField
            label="頻度"
            value={business.frequency}
            onChange={(v) => updateBusiness(i, { frequency: v })}
          />
          <TextField
            label="開始条件"
            value={business.trigger}
            onChange={(v) => updateBusiness(i, { trigger: v })}
          />
          <TextAreaField
            label="具体的手順（1行1手順）"
            value={business.steps.join("\n")}
            onChange={(v) => updateBusiness(i, { steps: v.split("\n").filter((s) => s.trim().length > 0) })}
          />
          <TextAreaField
            label="判断ポイント"
            value={business.judgment}
            onChange={(v) => updateBusiness(i, { judgment: v })}
          />
          <TextAreaField
            label="例外・イレギュラー対応"
            value={business.exception}
            onChange={(v) => updateBusiness(i, { exception: v })}
          />
          <TextAreaField
            label="失敗時対応"
            value={business.failure}
            onChange={(v) => updateBusiness(i, { failure: v })}
          />
          <TextField
            label="使用ファイル・システム"
            value={business.systems}
            onChange={(v) => updateBusiness(i, { systems: v })}
          />
          {business.human_follow_up_note && (
            <p style={{ color: "crimson" }}>要人間フォロー: {business.human_follow_up_note}</p>
          )}
        </fieldset>
      ))}

      <fieldset style={fieldsetStyle}>
        <legend>未完了案件</legend>
        {result.unfinished_cases.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input
              placeholder="案件名"
              value={c.name}
              onChange={(e) => updateUnfinishedCase(i, { name: e.target.value })}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              placeholder="進捗状況"
              value={c.progress ?? ""}
              onChange={(e) => updateUnfinishedCase(i, { progress: e.target.value })}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              placeholder="次のアクション"
              value={c.next_action ?? ""}
              onChange={(e) => updateUnfinishedCase(i, { next_action: e.target.value })}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              placeholder="期限"
              value={c.deadline ?? ""}
              onChange={(e) => updateUnfinishedCase(i, { deadline: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="button" onClick={() => removeUnfinishedCase(i)}>
              削除
            </button>
          </div>
        ))}
        <button type="button" onClick={addUnfinishedCase}>
          ＋ 未完了案件を追加
        </button>
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend>後任者へのメッセージ</legend>
        <textarea
          value={result.closing_message ?? ""}
          onChange={(e) => setResult((prev) => ({ ...prev, closing_message: e.target.value }))}
          rows={4}
          style={{ ...inputStyle, width: "100%" }}
        />
      </fieldset>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
        {savedAt && <span style={{ color: "#2e7d32" }}>保存しました（{savedAt.toLocaleTimeString()}）</span>}
        {error && <span style={{ color: "crimson" }}>エラー: {error}</span>}
        <Link href={`/export/${submission.id}`}>出力へ進む</Link>
        <Link href={`/progress/${submission.id}`}>進捗に戻る</Link>
      </div>
    </main>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span style={{ display: "block", fontWeight: "bold", fontSize: 13 }}>{label}</span>
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span style={{ display: "block", fontWeight: "bold", fontSize: 13 }}>{label}</span>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={2} style={inputStyle} />
    </label>
  );
}

const fieldsetStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: 12,
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 6,
  boxSizing: "border-box",
};
