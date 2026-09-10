"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 簡易アクセスゲートのログイン画面。運営者・対象者で共通の合言葉（ACCESS_CODE）を
 * 入力するとアクセスできる（lib/auth.ts 参照）。
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "ログインに失敗しました");
        return;
      }
      const next = searchParams.get("next") || "/";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20 }}>HIKITSUGI AI</h1>
      <p style={{ color: "#555", fontSize: 14 }}>担当者から共有された合言葉を入力してください。</p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="合言葉"
          autoFocus
          style={{ display: "block", width: "100%", padding: 8, boxSizing: "border-box", marginBottom: 12 }}
        />
        <button type="submit" disabled={loading || !code} style={{ width: "100%", padding: 8 }}>
          {loading ? "確認中..." : "入る"}
        </button>
      </form>
      {error && <p style={{ color: "crimson", marginTop: 12, fontSize: 14 }}>{error}</p>}
    </main>
  );
}
