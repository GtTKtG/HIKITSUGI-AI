# 運用・障害対応 Runbook

このプロジェクトで実際に起きた障害とその対処を記録する。同じ症状が再発した時に
ゼロから原因調査をやり直さないための資料。新しい障害を解決したら、この形式で
追記すること（症状 → 原因 → 対処 → 再発防止）。

## デプロイ前の検証（必須）

コードを変更したら、pushする前に必ずローカルで以下を通す。

```bash
npx tsc --noEmit   # 型チェック
npm run build      # 本番ビルド（ESLintも実行される）
```

DBスキーマを変更した場合は、Supabase MCP（`mcp__Supabase__apply_migration`）で
対象プロジェクトへ適用し、`supabase/migrations/` にも同じ内容のファイルを追加する
（**アプリ本体とマイグレーションSQLは別々に管理されており、自動同期しない**。
片方だけ更新すると本番DBとコードが乖離する）。

## デプロイ手順

1. `git push` で `main` と、開発ブランチ（Claude Code運用時は `claude/*`）の
   両方を最新化する。
2. Vercelは `main` への push を検知して自動デプロイする（プレビュー/本番の
   紐付けはVercelプロジェクト設定に依存。Vercel MCPの `list_deployments` /
   `get_deployment` で `target: "production"` のデプロイができているか必ず確認する。
   **過去に「pushはしたが本番デプロイは走っていなかった」事故があった**
   ＝ 既知障害⑥参照）。
3. `get_deployment` の `readyState` が `READY` になるまで数十秒〜1分程度ポーリングする。
4. `get_runtime_errors`（直近10〜15分）でエラーが出ていないか確認する。
5. 実際の画面（`/interview` 等）で一通り動作確認する。特にAI呼び出しを伴う変更は
   ローカルで完全に再現できない（`ANTHROPIC_API_KEY` が無い環境が多い）ため、
   本番での実地確認が唯一の検証手段になることが多い。

## 既知障害

### ① Vercel関数のタイムアウト（maxDuration未設定・不足）

- **症状**：チャットで回答しても数十秒後に何も起きない。エラーも出ない。
  URLを再読み込みすると直前の質問がまた表示される（＝回答が保存されていない）。
- **原因**：`app/api/interview/chat/turn`, `app/api/interview/process` に
  `maxDuration` を明示していないとプラットフォーム既定値（Hobbyプランは短い）に
  依存する。このアプリは毎ターン会話履歴全文をAnthropic APIへ再送する設計で、
  会話が長くなるほど1回の呼び出しが長くなり、かつスキーマ不一致時は最大3回まで
  自動リトライする（＝最悪ケースでAPI呼び出し3回分の時間がかかる）ため、
  既定のタイムアウトを容易に超える。
- **対処**：両ルートに `export const maxDuration = 300;`（Hobbyプラン上限付近）を
  明示する。
- **再発防止**：新しいAPI RouteでAnthropic APIやDBへの複数回呼び出しを行う場合、
  作成時点で `maxDuration` を明示すること。既定値に頼らない。

### ② tool use のJSON SchemaとzodスキーマのRequired不一致

- **症状**：①の対策（maxDuration引き上げ）をしても同じ症状が再発する。
  Vercelのランタイムログに `"path":["result","businesses",N,"system_details",0,"url"],
  "message":"Required"` のようなzod検証エラーが大量に出る。
- **原因**：Anthropicへ渡すtool use側のJSON Schema（`lib/anthropic.ts`）で
  ある項目を `required` から外した（モデルの出力負荷を下げる目的）のに、対応する
  zodスキーマ（`lib/schema.ts`）を `.optional()` にし忘れると、モデルが
  （許可されている通りに）そのキーを省略するたびに「Required」でスキーマ不一致になり、
  `callToolWithRetry` が毎回リトライを consume してタイムアウトを誘発する。
- **対処**：tool use側で `required` から外した項目は、**必ず対になる zod
  スキーマ側も** `.optional().default(...)` にする。片方だけの変更は事故のもと。
- **再発防止**：`lib/anthropic.ts` のtool JSON Schemaと `lib/schema.ts` の
  zodスキーマは、必ずセットで変更する。レビュー時は両ファイルの差分を並べて確認する。

### ③ モデルが必須キー（type / result）自体をランダムに省略する

- **症状**：業務数が多い（＝done時の出力が巨大な）インタビューで、3回リトライしても
  スキーマ不一致が続く。ログを見ると、attempt 1では `result` キーが丸ごと無く、
  attempt 2では `result` はあるが `type` が無い、というように**壊れ方が毎回違う**。
- **原因**：出力が非常に大きい場合の、モデル固有の出力信頼性の限界。スキーマの
  問題ではない（`type`・`result` はそもそも省略不可能な必須フィールド）。
- **対処**：`callToolWithRetry()`（`lib/anthropic.ts`）を「同じリクエストの盲目的な
  再送」から「直前の失敗をAnthropicの `tool_result`（`is_error: true`）で
  フィードバックしてから再試行」する方式に変更。加えて `max_tokens` を8192→16000に
  引き上げ、systemプロンプトにも「type・message・result の3キーを絶対に省略しない」
  という強調文を追加した。
- **再発防止**：出力サイズが大きくなりうる構造化出力タスクでは、単純リトライではなく
  エラー内容をモデルにフィードバックする設計にする。`max_tokens` は出力想定サイズに
  余裕を持たせる。

### ④ Supabaseプロジェクトの自動停止（無料プラン）

- **症状**：`mcp__Supabase__list_tables` や `execute_sql` が
  `Connection terminated due to connection timeout` で失敗する。本番アプリ側では
  DB系のAPI（進捗画面等）が全滅する。
- **原因**：Supabase無料プランは、一定期間アクセスがないとプロジェクトが
  `INACTIVE`（一時停止）になる。
- **対処**：`mcp__Supabase__restore_project`（またはSupabaseダッシュボードから
  「Restore」）で復帰させ、30秒〜1分程度待ってから再試行する。データが消えるわけ
  ではない（停止≠削除）。
- **再発防止**：本番運用に入ったら有料プラン（Pro等）への切り替えを検討する。
  少なくとも、長期間アプリへのアクセスが無い状態が続く見込みなら、事前に
  `restore_project` を叩いてから触り始める。

### ⑤ Excel等のファイルを回答欄にドラッグ＆ドロップするとページがフリーズする

- **症状**：`/interview` の回答欄にExcelファイル等をドラッグ＆ドロップすると、
  ブラウザがそのファイルをタブ全体に開こうとし、フリーズしたように見える。
- **原因**：`dragover` / `drop` イベントで `preventDefault()` していなかったため、
  ブラウザの既定動作（ドロップされたファイルをナビゲーション先として開く）が発火した。
- **対処**：`app/GlobalDropGuard.tsx` でウィンドウ全体の `dragover`/`drop` の既定動作を
  止め、`app/layout.tsx` に組み込んだ。個別のファイル取り込みはExcel/CSVパーサー
  （`lib/parseSpreadsheetFile.ts`）経由でのみ許可する。
- **再発防止**：ファイルアップロード系UIを追加する際は、必ずウィンドウ全体の
  既定ドロップ動作が防がれているか確認する。

### ⑥ pushしたのに本番に反映されていない

- **症状**：コードは修正してpushしたはずなのに、本番で症状が直らない。
- **原因**：開発ブランチ（`claude/*`）にはpushしていたが、`main`（本番Vercel
  プロジェクトの紐付け先）には反映されていなかった。
- **対処**：Vercel MCPの `list_deployments` で対象コミットSHAの
  `target: "production"` デプロイが存在するか必ず確認する。存在しなければ
  `main` へpushし直す。
- **再発防止**：このプロジェクトでは **`main` と `claude/new-session-kt67hd` の
  両方に毎回push**し、`list_deployments` → `get_deployment`（READY確認）→
  `get_runtime_errors` の順で検証してから「直した」と報告する運用を徹底している。

## 環境変数一覧（`.env.example` 参照）

| 変数 | 必須 | 用途 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 必須 | Anthropic API呼び出し |
| `ANTHROPIC_MODEL` | 任意 | 既定 `claude-sonnet-5`。モデル切り替え時に上書き |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 実質必須 | 未設定でもビルド・一部APIは動くが、結果保存・進捗/プレビュー/出力/後任者確認画面が全滅する |
| `ACCESS_CODE` | 本番では必須 | 未設定だと認証ゲートが機能せず誰でも全データにアクセスできてしまう |

## 監視・調査の基本手順

障害調査は次の順で行う（本番でしか起きない不具合が多いため、ローカル再現に
こだわらず本番ログを先に見る）。

1. `mcp__Vercel__get_runtime_errors`（プロジェクト全体の直近エラークラスタ。
   まずこれで当たりをつける）
2. `mcp__Vercel__get_runtime_logs`（生ログ。Hobbyプランは保持期間が短い＝
   1時間程度なので、事象発生後なるべく早く取得する）
3. Supabase MCPの `execute_sql` で該当セッション・submissionの実データを直接見る
   （例：`interview_chat_sessions.messages` の件数・内容、
   `interview_submissions.result` の中身）
4. 上記を踏まえて仮説を立て、修正 → ローカル検証 → デプロイ → 本番ログで
   エラーが消えたことを確認、のサイクルを回す。**「直したはず」で終わらせず、
   必ず本番ログか実際の画面操作で確認する**（このプロジェクトでは、確認せずに
   「直った」と報告して実際には直っていなかった事例が複数回あった）。
