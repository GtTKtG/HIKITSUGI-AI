"use client";

import { useState } from "react";
import Link from "next/link";
import type { InterviewResult, Business, SystemDetail } from "@/lib/schema";
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

  function updateSystemDetail(businessIndex: number, systemIndex: number, patch: Partial<SystemDetail>) {
    setResult((prev) => ({
      ...prev,
      businesses: prev.businesses.map((b, i) =>
        i === businessIndex
          ? {
              ...b,
              system_details: b.system_details.map((s, j) => (j === systemIndex ? { ...s, ...patch } : s)),
            }
          : b
      ),
    }));
  }

  function addSystemDetail(businessIndex: number) {
    setResult((prev) => ({
      ...prev,
      businesses: prev.businesses.map((b, i) =>
        i === businessIndex
          ? {
              ...b,
              system_details: [
                ...b.system_details,
                {
                  name: "",
                  url: "",
                  login_id: "",
                  password: null,
                  login_method: "",
                  permission: "",
                  device_restriction: "",
                  certificate: "",
                  application_destination: "",
                  proxy: "",
                  manual_location: "",
                  file_location: "",
                  note: "",
                },
              ],
            }
          : b
      ),
    }));
  }

  function removeSystemDetail(businessIndex: number, systemIndex: number) {
    setResult((prev) => ({
      ...prev,
      businesses: prev.businesses.map((b, i) =>
        i === businessIndex
          ? { ...b, system_details: b.system_details.filter((_, j) => j !== systemIndex) }
          : b
      ),
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
        {
          name: "",
          progress: "",
          next_action: "",
          deadline: "",
          purpose_scope: "",
          open_issues: "",
          owner: "",
          decision_maker: "",
          counterpart: "",
          related_materials_location: "",
          impact_if_neglected: "",
          completion_condition: "",
          completion_confirmer: "",
          next_review_date: "",
        },
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
            {business.mandatory_gate_missing.length > 0 && (
              <span style={{ color: "#c62828", fontWeight: "bold", marginLeft: 8, fontSize: 12 }}>
                引継未完了：{business.mandatory_gate_missing.join("、")}が未確認
              </span>
            )}
          </legend>
          <TextField
            label="業務の目的・対象"
            value={business.purpose}
            onChange={(v) => updateBusiness(i, { purpose: v })}
          />
          <TextField
            label="頻度・実施時期"
            value={business.frequency}
            onChange={(v) => updateBusiness(i, { frequency: v })}
          />
          <TextField
            label="開始条件"
            value={business.trigger}
            onChange={(v) => updateBusiness(i, { trigger: v })}
          />
          <TextField
            label="期限（法定・社内・着手時期）"
            value={business.deadline}
            onChange={(v) => updateBusiness(i, { deadline: v })}
          />
          <TextAreaField
            label="具体的手順（1行1手順）"
            value={business.steps.join("\n")}
            onChange={(v) => updateBusiness(i, { steps: v.split("\n").filter((s) => s.trim().length > 0) })}
          />
          <TextAreaField
            label="成果物・保存場所・命名規則"
            value={business.deliverables}
            onChange={(v) => updateBusiness(i, { deliverables: v })}
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
            label="使用ファイル・システム（要約）"
            value={business.systems}
            onChange={(v) => updateBusiness(i, { systems: v })}
          />
          <div style={{ marginBottom: 8 }}>
            <span style={{ display: "block", fontWeight: "bold", fontSize: 13, marginBottom: 4 }}>
              システムごとの詳細
            </span>
            <p style={{ fontSize: 12, color: "#999", marginTop: 0, marginBottom: 6 }}>
              ※ パスワードは引継書に記載しません。会社が定める安全な方法で別途移管してください。
            </p>
            {business.system_details.map((sys, j) => (
              <div key={j} style={systemCardStyle}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input
                    placeholder="システム・ファイル名"
                    value={sys.name}
                    onChange={(e) => updateSystemDetail(i, j, { name: e.target.value })}
                    style={{ ...inputStyle, flex: 1, fontWeight: "bold" }}
                  />
                  <button type="button" onClick={() => removeSystemDetail(i, j)}>
                    削除
                  </button>
                </div>
                <SystemField label="URL" value={sys.url} onChange={(v) => updateSystemDetail(i, j, { url: v })} />
                <SystemField
                  label="ログインID"
                  value={sys.login_id}
                  onChange={(v) => updateSystemDetail(i, j, { login_id: v })}
                />
                <SystemField
                  label="利用機能・ログイン方法"
                  value={sys.login_method}
                  onChange={(v) => updateSystemDetail(i, j, { login_method: v })}
                />
                <SystemField
                  label="権限"
                  value={sys.permission}
                  onChange={(v) => updateSystemDetail(i, j, { permission: v })}
                />
                <SystemField
                  label="端末制限"
                  value={sys.device_restriction}
                  onChange={(v) => updateSystemDetail(i, j, { device_restriction: v })}
                />
                <SystemField
                  label="電子証明書"
                  value={sys.certificate}
                  onChange={(v) => updateSystemDetail(i, j, { certificate: v })}
                />
                <SystemField
                  label="申請先"
                  value={sys.application_destination}
                  onChange={(v) => updateSystemDetail(i, j, { application_destination: v })}
                />
                <SystemField
                  label="代理者"
                  value={sys.proxy}
                  onChange={(v) => updateSystemDetail(i, j, { proxy: v })}
                />
                <SystemField
                  label="マニュアル保管場所"
                  value={sys.manual_location}
                  onChange={(v) => updateSystemDetail(i, j, { manual_location: v })}
                />
                <SystemField
                  label="関連ファイル保存場所"
                  value={sys.file_location}
                  onChange={(v) => updateSystemDetail(i, j, { file_location: v })}
                />
                <SystemField label="備考" value={sys.note} onChange={(v) => updateSystemDetail(i, j, { note: v })} />
              </div>
            ))}
            <button type="button" onClick={() => addSystemDetail(i)}>
              ＋ システムを追加
            </button>
          </div>
          <TextAreaField
            label="権限移管状況（付与状況・停止日・未完了の申請）"
            value={business.access_handover}
            onChange={(v) => updateBusiness(i, { access_handover: v })}
          />
          {business.human_follow_up_note && (
            <p style={{ color: "crimson" }}>要人間フォロー: {business.human_follow_up_note}</p>
          )}
        </fieldset>
      ))}

      <fieldset style={fieldsetStyle}>
        <legend>未完了案件</legend>
        {result.unfinished_cases.map((c, i) => (
          <div key={i} style={systemCardStyle}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input
                placeholder="案件名"
                value={c.name}
                onChange={(e) => updateUnfinishedCase(i, { name: e.target.value })}
                style={{ ...inputStyle, flex: 1, fontWeight: "bold" }}
              />
              <button type="button" onClick={() => removeUnfinishedCase(i)}>
                削除
              </button>
            </div>
            <SystemField
              label="目的・対象範囲・背景"
              value={c.purpose_scope}
              onChange={(v) => updateUnfinishedCase(i, { purpose_scope: v })}
            />
            <SystemField
              label="現在のステータス"
              value={c.progress}
              onChange={(v) => updateUnfinishedCase(i, { progress: v })}
            />
            <SystemField
              label="未決事項・懸念・依存関係"
              value={c.open_issues}
              onChange={(v) => updateUnfinishedCase(i, { open_issues: v })}
            />
            <SystemField
              label="次のアクション"
              value={c.next_action}
              onChange={(v) => updateUnfinishedCase(i, { next_action: v })}
            />
            <SystemField
              label="次回予定日"
              value={c.next_review_date}
              onChange={(v) => updateUnfinishedCase(i, { next_review_date: v })}
            />
            <SystemField
              label="最終期限"
              value={c.deadline}
              onChange={(v) => updateUnfinishedCase(i, { deadline: v })}
            />
            <SystemField
              label="主担当者"
              value={c.owner}
              onChange={(v) => updateUnfinishedCase(i, { owner: v })}
            />
            <SystemField
              label="意思決定者"
              value={c.decision_maker}
              onChange={(v) => updateUnfinishedCase(i, { decision_maker: v })}
            />
            <SystemField
              label="相手方の窓口"
              value={c.counterpart}
              onChange={(v) => updateUnfinishedCase(i, { counterpart: v })}
            />
            <SystemField
              label="関連資料・打合せ記録の所在"
              value={c.related_materials_location}
              onChange={(v) => updateUnfinishedCase(i, { related_materials_location: v })}
            />
            <SystemField
              label="放置・遅延した場合の影響"
              value={c.impact_if_neglected}
              onChange={(v) => updateUnfinishedCase(i, { impact_if_neglected: v })}
            />
            <SystemField
              label="完了条件"
              value={c.completion_condition}
              onChange={(v) => updateUnfinishedCase(i, { completion_condition: v })}
            />
            <SystemField
              label="完了を確認する者"
              value={c.completion_confirmer}
              onChange={(v) => updateUnfinishedCase(i, { completion_confirmer: v })}
            />
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

function SystemField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: "#555", width: 140, flexShrink: 0 }}>{label}</span>
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
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

const systemCardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 6,
  padding: 10,
  marginBottom: 8,
  background: "#fafafa",
};

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
