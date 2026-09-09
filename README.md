# HIKITSUGI-AI

退職・異動者へのインタビュー文字起こしをAIが構造化し、後任者向けの引継書パッケージを
作成するサービス。詳細な事業設計・機能設計は `docs/spec.md` を参照。

## 現在の実装範囲（優先順位1〜2）

開発仕様書 11章の優先順位に沿って、以下を実装している。

- 仕様書 7.2 のJSON出力プロンプトを使い、バックエンド（Next.js API Route）から
  Claude API を直接呼び出す最小構成（`POST /api/interview/process`）
- 仕様書8章の5画面のうち4画面（企業管理画面を除く）
  - `/interview` — AIインタビュー（文字起こしの貼り付け／`.txt`アップロード）
  - `/progress/[id]` — 進捗（総合充足率、業務把握／判断基準／例外対応のカテゴリ別充足率、
    再質問・要人間フォローの一覧）
  - `/preview/[id]` — 引継書プレビュー（内容を修正して保存可能）
  - `/export/[id]` — 出力（Word `.docx` / PDF ダウンロード）
- DB保存は Supabase（`interview_submissions` テーブル1つ）。**進捗／プレビュー／出力の
  各画面は、結果をIDで引き直せる必要があるため Supabase 設定が必須**（`/api/interview/process`
  自体はDB未設定でも動作するが、その場合は画面遷移できず結果がその場に表示されるのみ）
- 認証は未実装（最小限）

**未実装（優先順位3以降）**：企業管理画面、認証、顧客データの分離・保存期間設定・
削除機能（本番の顧客データを扱う前に必須、仕様書4章）。PDFの日本語描画には
IPAゴシック（`assets/fonts/ipag.ttf`、IPAフォントライセンスv1.0で再配布可）を同梱している。

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に ANTHROPIC_API_KEY を設定
# 進捗／プレビュー/出力画面を使うには SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY も設定
npm run dev
```

Supabase を使う場合は `supabase/migrations/` 配下のマイグレーションを番号順に対象の
プロジェクトへ適用し、`.env.local` に `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
（サーバー専用・service role key）を設定する。

## 画面フロー

```
/interview（AIインタビュー入力）
  → /progress/[id]（進捗確認）
    → /preview/[id]（引継書プレビュー・修正）
      → /export/[id]（Word / PDF 出力）
```

## API

### `POST /api/interview/process`

```json
{
  "transcript": "（Web会議の文字起こし本文）",
  "interview_round": 1,
  "company_name": "任意",
  "employee_name": "任意"
}
```

- `transcript`: 必須。文字起こし本文。
- `interview_round`: 1〜3（省略時1）。再質問後の2回目・3回目は、この値を
  インクリメントして同じ形式で再送する（仕様書 6.4 / 7.3）。
- レスポンスは `submission_id`（Supabase保存先ID。DB未設定時は null）と、
  仕様書 7.2 のJSON形式（`businesses` / `unfinished_cases` / `closing_message` /
  `re_questions` / `interview_round`）を含む `result` を返す。

### `GET /api/interview/[id]`

保存済みの処理結果を取得する。

### `PATCH /api/interview/[id]`

引継書プレビュー画面での修正内容（仕様書7.2のJSON形式全体）を保存する。

### `GET /api/interview/[id]/export?format=docx|pdf`

Word または PDF をダウンロードする。

## 動作確認

`npm run dev` 後、`http://localhost:3000` から `/interview` に進み、文字起こしを貼り付けて
送信すると、進捗 → プレビュー → 出力の順に画面遷移して確認できる（Supabase設定が必要）。
