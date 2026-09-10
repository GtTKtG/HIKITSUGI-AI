"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DisplayMessage {
  role: "assistant" | "user";
  content: string;
}

/**
 * 仕様書8章 画面2「AIインタビュー」（新仕様：チャット版）。
 * 対象者本人がAIと直接チャットしながら、1問ずつ答えてインタビューを完了する
 * （5章・7.1・7.2）。文字起こしのアップロードは不要。
 */
export default function ChatInterviewPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isGrantUser, setIsGrantUser] = useState(false);
  const [started, setStarted] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 顧客固有コードでアクセスしている場合は、会社名・対象者名の入力を省略して
  // 自動的にインタビューを開始する（既に完了済みなら進捗画面へ）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (cancelled) return;
        if (data.kind === "grant") {
          setIsGrantUser(true);
          if (data.submission_id) {
            router.push(`/progress/${data.submission_id}`);
            return;
          }
          setLoading(true);
          const turn = await callTurn({});
          if (cancelled) return;
          setSessionId(turn.session_id);
          setMessages([{ role: "assistant", content: turn.message }]);
          setStarted(true);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "不明なエラー");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function callTurn(payload: {
    session_id?: string;
    message?: string;
    company_name?: string;
    employee_name?: string;
  }) {
    const res = await fetch("/api/interview/chat/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data as {
      session_id: string;
      done: boolean;
      message: string;
      submission_id?: string | null;
    };
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enterで送信、Shift+Enterで改行（箇条書きなど複数行の回答に対応）。
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    // Excel等のファイルをドラッグ＆ドロップすると、対策をしていないとブラウザが
    // そのファイルをタブごと開こうとして固まったように見えるため、ここで防ぐ。
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      setError(
        "ファイルの添付には対応していません。Excel等の内容は、該当箇所をコピーしてこの欄にテキストとして貼り付けてください。"
      );
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!sessionId || !input.trim()) return;
    const userText = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const data = await callTurn({ session_id: sessionId, message: userText });
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      if (data.done) {
        setDone(true);
        if (data.submission_id) {
          setTimeout(() => router.push(`/progress/${data.submission_id}`), 1500);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await callTurn({
        company_name: companyName || undefined,
        employee_name: employeeName || undefined,
      });
      setSessionId(data.session_id);
      setMessages([{ role: "assistant", content: data.message }]);
      setStarted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#777" }}>読み込み中...</p>
      </main>
    );
  }

  if (!started) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
        <h1>AIインタビュー</h1>
        <p style={{ color: "#555" }}>
          このままAIとチャットしながら、担当業務の引き継ぎ内容をお答えください。
          1問ずつ質問しますので、思い出しながらで大丈夫です。
        </p>
        <form onSubmit={handleStart}>
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>会社名（任意）</span>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>お名前（任意）</span>
            <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} style={inputStyle} />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "開始しています..." : "インタビューを始める"}
          </button>
        </form>
        {error && <p style={{ color: "crimson", marginTop: 16 }}>エラー: {error}</p>}
        <p style={{ fontSize: 13, color: "#777", marginTop: 24 }}>
          運営者が代理入力する場合は
          <Link href="/interview/transcript">文字起こし方式の画面</Link>
          もご利用いただけます。
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", height: "100vh", boxSizing: "border-box" }}>
      <h1 style={{ marginBottom: 8 }}>AIインタビュー</h1>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 12,
          background: "#fafafa",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "8px 12px",
                borderRadius: 12,
                background: m.role === "user" ? "#2e7d32" : "#fff",
                color: m.role === "user" ? "#fff" : "#000",
                border: m.role === "user" ? "none" : "1px solid #ddd",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {done && (
          <p style={{ textAlign: "center", color: "#2e7d32", fontWeight: "bold" }}>
            インタビューが完了しました。進捗画面に移動します…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {!done && (
        <form onSubmit={handleSend} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            onDrop={handleDrop}
            placeholder="回答を入力...（複数行可。Shift+Enterで改行、Enterで送信）"
            rows={3}
            maxLength={4000}
            style={{ ...inputStyle, flex: 1, resize: "vertical", fontFamily: "inherit" }}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? "…" : "送信"}
          </button>
        </form>
      )}
      {!done && (
        <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
          ※ ファイルの添付には対応していません。Excel等の内容は該当箇所をコピーしてテキストで貼り付けてください。
        </p>
      )}
      {error && <p style={{ color: "crimson", marginTop: 8 }}>エラー: {error}</p>}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  boxSizing: "border-box",
};
