import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

/**
 * トップページ。優先順位2の4画面（AIインタビュー→進捗→プレビュー→出力）への
 * 導線のみを提供する。企業管理画面（優先順位3以降）は未実装。
 */
export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1>HIKITSUGI AI</h1>
      <p style={{ color: "#555" }}>
        退職・異動者へのAIインタビューから、5営業日以内に引継書パッケージを作成します。
      </p>
      <ol style={{ lineHeight: 2 }}>
        <li>
          <Link href="/interview">AIインタビュー</Link> — 対象者がAIと直接チャットして答える
        </li>
        <li>進捗 — 各業務の充足率スコアを確認する（インタビュー完了後に遷移）</li>
        <li>引継書プレビュー — 内容を確認・修正する</li>
        <li>出力 — Word / PDFでダウンロードする</li>
      </ol>
      <p style={{ fontSize: 13, color: "#777" }}>
        企業管理画面は未実装です（優先順位3以降）。運営者が代理入力する場合は
        <Link href="/interview/transcript">文字起こし方式の画面</Link>
        も利用できます。
      </p>
      <p style={{ marginTop: 32 }}>
        <LogoutButton />
      </p>
    </main>
  );
}
