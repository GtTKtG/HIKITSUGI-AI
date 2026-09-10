"use client";

import { useEffect, useState } from "react";

interface Grant {
  id: string;
  code: string;
  company_name: string | null;
  employee_name: string | null;
  chat_session_id: string | null;
  submission_id: string | null;
  created_at: string;
  redeemed_at: string | null;
}

/**
 * 運営者用の案件管理画面（企業管理画面の簡易版）。
 * 新しい案件（対象者1名分の依頼）を登録すると、固有のアクセスコード・URLが
 * 発行される。それを入金確認後に対象者へメールで送る運用を想定している。
 */
export default function AdminPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    void loadGrants();
  }, []);

  async function loadGrants() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/grants");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setGrants(data.grants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: companyName || undefined, employee_name: employeeName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCompanyName("");
      setEmployeeName("");
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setCreating(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1>案件管理</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        入金確認後、ここで案件を登録するとアクセスURL・コードが発行されます。それを対象者にメールで送ってください。
      </p>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="会社名"
          style={{ padding: 8, flex: 1, minWidth: 160 }}
        />
        <input
          value={employeeName}
          onChange={(e) => setEmployeeName(e.target.value)}
          placeholder="対象者名"
          style={{ padding: 8, flex: 1, minWidth: 160 }}
        />
        <button type="submit" disabled={creating}>
          {creating ? "作成中..." : "案件を作成"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>エラー: {error}</p>}

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: 8 }}>会社名</th>
                <th style={{ padding: 8 }}>対象者</th>
                <th style={{ padding: 8 }}>状態</th>
                <th style={{ padding: 8 }}>コード</th>
                <th style={{ padding: 8 }}>アクセスURL</th>
                <th style={{ padding: 8 }}>作成日時</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => {
                const url = `${origin}/enter/${g.code}`;
                const status = g.submission_id ? "完了" : g.chat_session_id ? "進行中" : g.redeemed_at ? "開始済み" : "未開封";
                return (
                  <tr key={g.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{g.company_name || "—"}</td>
                    <td style={{ padding: 8 }}>{g.employee_name || "—"}</td>
                    <td style={{ padding: 8 }}>{status}</td>
                    <td style={{ padding: 8 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <code style={{ fontSize: 13, fontWeight: "bold" }}>{g.code}</code>
                        <button type="button" onClick={() => copy(g.code)} style={{ fontSize: 12 }}>
                          コピー
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: 8 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <code style={{ fontSize: 12, wordBreak: "break-all" }}>{url}</code>
                        <button type="button" onClick={() => copy(url)} style={{ fontSize: 12 }}>
                          コピー
                        </button>
                        {g.submission_id && (
                          <a href={`/progress/${g.submission_id}`} style={{ fontSize: 12 }}>
                            結果を見る
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: 8 }}>{new Date(g.created_at).toLocaleString("ja-JP")}</td>
                  </tr>
                );
              })}
              {grants.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#777" }}>
                    まだ案件がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
