"use client";

import { useState } from "react";

/**
 * 動作確認用の簡易ページ。
 * 仕様書8章の5画面（企業管理／AIインタビュー／進捗／引継書プレビュー／出力）は
 * 優先順位2以降で実装する。ここでは /api/interview/process の疎通確認のみを行う。
 */
export default function Home() {
  const [transcript, setTranscript] = useState("");
  const [round, setRound] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<unknown>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/interview/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, interview_round: round }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResponse(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>HIKITSUGI AI — 動作確認用</h1>
      <p style={{ color: "#555" }}>
        /api/interview/process の疎通確認用の簡易フォームです。本番UI（5画面）は別途実装します。
      </p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8 }}>
          インタビュー回数（interview_round）
          <input
            type="number"
            min={1}
            max={3}
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            style={{ display: "block", width: 80, marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          文字起こし本文
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={12}
            style={{ display: "block", width: "100%", marginTop: 4 }}
            placeholder="Web会議の文字起こしを貼り付けてください"
          />
        </label>
        <button type="submit" disabled={loading || transcript.trim().length === 0}>
          {loading ? "処理中..." : "送信"}
        </button>
      </form>

      {error && (
        <p style={{ color: "crimson", marginTop: 16 }}>エラー: {error}</p>
      )}

      {response != null && (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            background: "#f5f5f5",
            overflowX: "auto",
            fontSize: 12,
          }}
        >
          {JSON.stringify(response, null, 2)}
        </pre>
      )}
    </main>
  );
}
