"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * バッチ版AIインタビュー（新仕様書7.3「モニター期間の代替運用」）。
 * 従来のPhase 2方式（運営者が電話で聞き取り→外部ツールで文字起こし→AIが事後に
 * 一括構造化）を、チャット版インタビュー（/interview）の検証期間中の代替手段として
 * 並行して残している画面。
 */
export default function TranscriptInterviewPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [round, setRound] = useState(1);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setTranscript(text);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          interview_round: round,
          company_name: companyName || undefined,
          employee_name: employeeName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.submission_id) {
        router.push(`/progress/${data.submission_id}`);
      } else {
        // DB未設定のため保存先IDがない場合は結果をその場に表示する。
        setError(null);
        alert(
          "Supabaseが未設定のため保存できませんでした。処理結果:\n\n" +
            JSON.stringify(data.result, null, 2)
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>AIインタビュー（文字起こし方式・代替運用）</h1>
      <p style={{ color: "#555" }}>
        通常は<Link href="/interview">チャット版AIインタビュー</Link>
        をご利用ください。こちらは、運営者が電話等で聞き取った内容の文字起こしを
        事後にまとめて構造化する代替手段です。再質問への回答を反映する場合は、
        インタビュー回数を増やして再送してください（最大3回）。
      </p>
      <form onSubmit={handleSubmit}>
        <Field label="会社名（任意）">
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="対象者氏名（任意）">
          <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="インタビュー回数">
          <input
            type="number"
            min={1}
            max={3}
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            style={{ ...inputStyle, width: 80 }}
          />
        </Field>
        <Field label="文字起こしファイル（.txt、任意）">
          <input type="file" accept=".txt" onChange={handleFile} />
        </Field>
        <Field label="文字起こし本文">
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={14}
            style={{ ...inputStyle, fontFamily: "monospace" }}
            placeholder="Web会議の文字起こしを貼り付けてください"
          />
        </Field>
        <button type="submit" disabled={loading || transcript.trim().length === 0}>
          {loading ? "処理中..." : "送信して構造化する"}
        </button>
      </form>
      {error && <p style={{ color: "crimson", marginTop: 16 }}>エラー: {error}</p>}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 6,
  boxSizing: "border-box",
};
