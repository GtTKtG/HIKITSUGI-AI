# HIKITSUGI-AI

退職・異動者へAIが直接チャットでインタビューし、後任者向けの引継書パッケージを
作成するサービス。

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| `docs/spec.md` | 事業設計・機能仕様（要件定義）。ヒアリング設計・判定ロジックの「なぜ」はここ |
| `docs/architecture.md` | システム全体像・ディレクトリ構成・主要フロー・認可モデル |
| `docs/database.md` | ER図・テーブル定義・マイグレーション一覧 |
| `docs/api.md` | 全APIエンドポイントの仕様（リクエスト/レスポンス） |
| `docs/runbook.md` | デプロイ手順・既知障害と対処・監視手順 |
| `docs/glossary.md` | ドメイン用語集 |

初めて触る場合は `architecture.md` → `glossary.md` の順で読むと全体像を掴みやすい。
何か直す前には `runbook.md` の既知障害一覧に同じ症状がないか確認する。

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
- **業務の性格による質問分岐**（仕様書5.1）：業務ごとに「管理系（定型）」「企画系
  （状況に応じた判断が中心）」を判定し、企画系業務では固定手順の代わりに判断の
  拠り所・関係者への配慮を深掘りする（`business_type`）
- **後任者による再現性確認**（仕様書5.3）：引継書完成後、後任者へ専用リンク
  （`/successor/<code>`）を発行し、業務ごとに「対応できる／質問がある」を確認して
  もらう。質問は進捗画面（`/progress/[id]`）から前任者・運営者が回答できる
- DB保存は Supabase（`interview_chat_sessions` でチャットの会話状態を保持し、
  完了時に `interview_submissions` へ結果を書き出す。進捗／プレビュー／出力画面は
  `interview_submissions` を共通で参照する）。**チャット・バッチとも、結果をIDで
  引き直す画面遷移があるため Supabase 設定が必須**
- **アクセス制御（2階層）**：
  - 運営者用マスターコード（`ACCESS_CODE` 環境変数）：`/admin`（案件管理）などの
    運営者専用画面にアクセスするためのコード
  - 顧客ごとの固有アクセスコード（`access_grants` テーブル）：運営者が `/admin` で
    案件（会社名・対象者名）を登録すると自動発行される。対象者はこのコード付きの
    URL（`/enter/<code>`）にアクセスすると、自分の案件のインタビュー・結果
    （進捗／プレビュー／出力）のみを閲覧・操作できる（他の顧客のデータは見えない）
  - 入金確認後、運営者が `/admin` で案件を作成し、発行されたURLを対象者にメールで
    送る運用を想定（`middleware.ts` / `lib/auth.ts` / `lib/authServer.ts` / `lib/grants.ts`）

**未実装（優先順位3以降）**：企業管理画面の本格版（現状は案件作成・一覧のみの簡易版）、
保存期間設定・削除機能（本番の顧客データを扱う前に必須、仕様書4章）。音声による
ヒアリングは仕様書上も将来検討・今回対象外。PDFの日本語描画には
IPAゴシック（`assets/fonts/ipag.ttf`、IPAフォントライセンスv1.0で再配布可）を同梱している。

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に ANTHROPIC_API_KEY を設定
# 進捗／プレビュー/出力画面を使うには SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY も設定
# 未設定だと誰でもアクセスできてしまうため、ACCESS_CODE（運営者用）も設定する（本番では必須）
npm run dev
```

運営者としてログインするには `/login` で `ACCESS_CODE` の値を入力する。ログイン後
`/admin` で案件（会社名・対象者名）を作成すると、その案件専用のアクセスコード・URL
（`/enter/<code>`）が発行されるので、それを対象者にメールで送る。

Supabase を使う場合は `supabase/migrations/` 配下のマイグレーションを番号順に対象の
プロジェクトへ適用し、`.env.local` に `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
（サーバー専用・service role key）を設定する。

## 画面フロー

```
/interview（チャット版AIインタビュー）─┐
/interview/transcript（文字起こし方式）─┴→ /progress/[id]（進捗確認・後任者確認リンク発行）
                                            → /preview/[id]（引継書プレビュー・修正）
                                              → /export/[id]（Word / PDF 出力）

/progress/[id] --[リンク発行]--> /successor/<code>（後任者による再現性確認）
```

## API

全エンドポイントの仕様（リクエスト/レスポンス形式・認可要件）は
[`docs/api.md`](docs/api.md) を参照。

## 動作確認

`npm run dev` 後、`http://localhost:3000` から `/interview` に進み、AIとチャットで
インタビューを完了すると、進捗 → プレビュー → 出力の順に画面遷移して確認できる
（Supabase設定が必要）。
