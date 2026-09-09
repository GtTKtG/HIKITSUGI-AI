# HIKITSUGI-AI

退職・異動者へのインタビュー文字起こしをAIが構造化し、後任者向けの引継書パッケージを
作成するサービス。詳細な事業設計・機能設計は `docs/spec.md` を参照。

## 現在の実装範囲（優先順位1）

開発仕様書 11章の優先順位に沿って、まず以下のみを実装している。

- 仕様書 7.2 のJSON出力プロンプトを使い、バックエンド（Next.js API Route）から
  Claude API を直接呼び出す最小構成（`POST /api/interview/process`）
- DB保存は Supabase（任意・未設定でも動作する）、認証は未実装（最小限）
- 5画面のうち本番UIは未実装。`/` は API 疎通確認用の簡易フォームのみ

**未実装（優先順位2以降）**：企業管理／進捗／引継書プレビュー／出力画面、認証、
顧客データの分離・保存期間設定・削除機能（本番の顧客データを扱う前に必須）。

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に ANTHROPIC_API_KEY を設定（Supabase は任意）
npm run dev
```

Supabase を使う場合は `supabase/migrations/0001_interview_submissions.sql` を対象の
プロジェクトに適用し、`.env.local` に `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
（サーバー専用・service role key）を設定する。

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
- レスポンスは仕様書 7.2 のJSON形式（`businesses` / `unfinished_cases` /
  `closing_message` / `re_questions` / `interview_round`）を `result` に含む。

## 動作確認

`npm run dev` 後、`http://localhost:3000` で文字起こしを貼り付けて送信すると、
API のレスポンスをそのまま確認できる（本番UIではない、疎通確認用）。
