# HIKITSUGI-AI

退職・異動者へAIが直接チャットでインタビューし、後任者向けの引継書パッケージを
作成するサービス。詳細な事業設計・機能設計は `docs/spec.md` を参照。

## 現在の実装範囲（優先順位1〜2）

開発仕様書 11章の優先順位に沿って、以下を実装している。

- **チャット版AIインタビュー**（本線・仕様書5章・7.1・7.2）：対象者本人がAIと
  ターン単位でチャットしながら1問ずつ回答し、その場で充足判定・聞き返しまで行う
  （`POST /api/interview/chat/turn`、画面は `/interview`）
- **バッチ版AIインタビュー**（代替運用・仕様書7.3）：文字起こし全文を一括で
  Claudeに渡して構造化する従来方式。モニター期間中の比較対象として並行して残している
  （`POST /api/interview/process`、画面は `/interview/transcript`）
- 仕様書8章の5画面のうち4画面（企業管理画面を除く）
  - `/interview` — AIインタビュー（チャット形式）
  - `/interview/transcript` — AIインタビュー（文字起こし方式・代替運用）
  - `/progress/[id]` — 進捗（総合充足率、業務把握／判断基準／例外対応のカテゴリ別充足率、
    再質問・要人間フォローの一覧）
  - `/preview/[id]` — 引継書プレビュー（内容を修正して保存可能）
  - `/export/[id]` — 出力（Word `.docx` / PDF ダウンロード）
- DB保存は Supabase（`interview_chat_sessions` でチャットの会話状態を保持し、
  完了時に `interview_submissions` へ結果を書き出す。進捗／プレビュー／出力画面は
  `interview_submissions` を共通で参照する）。**チャット・バッチとも、結果をIDで
  引き直す画面遷移があるため Supabase 設定が必須**
- 簡易アクセスゲート（`ACCESS_CODE` 環境変数）：運営者・対象者で共有する1つの
  合言葉を `/login` で入力するとCookieが発行され、以後アクセスできる
  （`middleware.ts` / `lib/auth.ts`）。企業ごとの個別ログインではないため、
  本番で複数顧客のデータを扱う前には仕様書4章に沿った本格的な認証への
  置き換えが必要

**未実装（優先順位3以降）**：企業管理画面、認証、顧客データの分離・保存期間設定・
削除機能（本番の顧客データを扱う前に必須、仕様書4章）。音声によるヒアリングは
仕様書上も将来検討・今回対象外。PDFの日本語描画には
IPAゴシック（`assets/fonts/ipag.ttf`、IPAフォントライセンスv1.0で再配布可）を同梱している。

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に ANTHROPIC_API_KEY を設定
# 進捗／プレビュー/出力画面を使うには SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY も設定
# 未設定だと誰でもアクセスできてしまうため、ACCESS_CODE も設定する（本番では必須）
npm run dev
```

Supabase を使う場合は `supabase/migrations/` 配下のマイグレーションを番号順に対象の
プロジェクトへ適用し、`.env.local` に `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
（サーバー専用・service role key）を設定する。

## 画面フロー

```
/interview（チャット版AIインタビュー）─┐
/interview/transcript（文字起こし方式）─┴→ /progress/[id]（進捗確認）
                                            → /preview/[id]（引継書プレビュー・修正）
                                              → /export/[id]（Word / PDF 出力）
```

## API

### `POST /api/interview/chat/turn`（チャット版・本線）

```json
{
  "session_id": "省略可（初回は省略してセッションを新規作成）",
  "message": "対象者の発言（初回は省略可）",
  "company_name": "任意（初回のみ）",
  "employee_name": "任意（初回のみ）"
}
```

- レスポンス：`{ "session_id", "done", "message", "submission_id"? }`
- `done: false` の間は `message`（AIからの次の質問）を表示し、対象者の回答を
  `message` に入れて同じ `session_id` で呼び続ける。
- `done: true` になったら、`submission_id` で `/progress/[id]` 等に遷移する。

### `POST /api/interview/process`（バッチ版・代替運用）

```json
{
  "transcript": "（文字起こし本文）",
  "interview_round": 1,
  "company_name": "任意",
  "employee_name": "任意"
}
```

- `interview_round`: 1〜3（省略時1）。再質問後の2回目・3回目は、この値を
  インクリメントして同じ形式で再送する（仕様書 6.4）。
- レスポンスは `submission_id`（Supabase保存先ID。DB未設定時は null）と、
  仕様書 7.2 のJSON形式を含む `result` を返す。

### `GET /api/interview/[id]`

保存済みの処理結果を取得する。

### `PATCH /api/interview/[id]`

引継書プレビュー画面での修正内容（7.2のJSON形式全体）を保存する。

### `GET /api/interview/[id]/export?format=docx|pdf`

Word または PDF をダウンロードする。

## 動作確認

`npm run dev` 後、`http://localhost:3000` から `/interview` に進み、AIとチャットで
インタビューを完了すると、進捗 → プレビュー → 出力の順に画面遷移して確認できる
（Supabase設定が必要）。
