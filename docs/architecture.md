# アーキテクチャ設計書

対象読者：このリポジトリを初めて触る開発者（人間・AIエージェント問わず）。
「何が」「どこで」動いているかを把握するための資料。「なぜそう作ったか」の背景・
業務要件は `docs/spec.md`、DBの詳細は `docs/database.md`、APIの詳細は `docs/api.md`、
障害対応は `docs/runbook.md` を参照。

## 1. システム全体像

```
[対象者(退職者)]                [後任者]                [運営者]
      │ チャット                    │ 確認/質問               │ 案件管理
      ▼                            ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App Router (Vercel)                │
│  app/interview        app/successor/[code]   app/admin       │
│  app/progress/[id]    app/preview/[id]       app/export/[id] │
│  middleware.ts（Cookie/固有コードによる認可ゲート）               │
└───────────────┬─────────────────────────────┬─────────────────┘
                │ サーバー側のみ                  │
                ▼                              ▼
      ┌──────────────────┐           ┌──────────────────┐
      │  Anthropic API    │           │     Supabase       │
      │ (claude-sonnet-5) │           │ (Postgres, service  │
      │ lib/anthropic.ts  │           │  role key で接続)   │
      └──────────────────┘           └──────────────────┘
```

- **フロントエンド／バックエンドの区別がない**：Next.js App Router を1つのVercel
  プロジェクトとしてデプロイしている。画面（`app/**/page.tsx`）と API
  （`app/api/**/route.ts`）が同じリポジトリ・同じデプロイ単位。
- **AIゲートウェイは使わない**：Anthropic API を `lib/anthropic.ts` から直接呼ぶ。
  APIキー（`ANTHROPIC_API_KEY`）はサーバー環境変数にのみ置き、フロントエンドには
  一切渡さない。
- **DBは Supabase（Postgres）**：`lib/supabase/server.ts` が service role key で
  接続するため、Row Level Security（RLS）は有効化してあるがポリシーは追加していない
  （＝サーバー経由のアクセスは常にRLSをバイパスし、anon/authenticatedロールからの
  直接アクセスは全面ブロックされる）。DB未設定でも動く箇所は動く設計
  （`getSupabaseServerClient()` が `null` を返し、呼び出し側が握りつぶす）。

## 2. ディレクトリ構成

```
app/
  interview/                 チャット版AIインタビュー画面（対象者用・本線）
  interview/transcript/      文字起こし一括投入画面（運営者専用・代替運用）
  progress/[id]/             進捗画面（スコア・必須ゲート・後任者確認パネル）
  preview/[id]/              引継書プレビュー・編集画面
  export/[id]/               Word/PDF ダウンロード画面
  successor/[code]/          後任者向け確認画面（認証Cookie不要・固有コードでゲート）
  admin/                     案件（顧客）管理画面（運営者専用）
  enter/[code]/               顧客固有コードのワンクリック入場（route.tsのみ、画面なし）
  login/                     運営者マスターコード／顧客固有コードのログイン画面
  api/                       上記画面に対応するAPI Route Handler群（詳細はapi.md）
lib/
  anthropic.ts               Anthropic API呼び出し・tool useスキーマ・リトライ制御
  schema.ts                  zodスキーマ（全データ形状の単一の正）
  scoring.ts                 客観採点・必須ゲート判定ロジック（決定的・AI出力を信用しない）
  auth.ts / authServer.ts    認証（マスターコード／固有コードの2階層）
  grants.ts                  顧客固有コード（access_grants）のCRUD
  successorReviews.ts        後任者確認（successor_reviews）のCRUD
  export/docx.ts, pdf.ts     引継書のWord/PDF生成
  prompts/                   system プロンプト（チャット版・バッチ版）
  supabase/                  Supabaseクライアント・テーブルごとのCRUD
supabase/migrations/         DBスキーマ変更履歴（番号順に手動適用。詳細はdatabase.md）
docs/                        spec.md（要件・機能仕様）＋本ディレクトリの実務ドキュメント
```

## 3. 主要フロー

### 3.1 インタビュー〜納品までの一気通貫フロー

```
対象者が /enter/<code> を開く
  → access_grants から該当コードを検索、Cookie発行
  → 未着手なら /interview、完了済みなら /progress/[id] へ

/interview（チャット）
  → POST /api/interview/chat/turn を1問ごとに呼ぶ
  → runChatTurn() が会話履歴全体 + system prompt を Anthropic API に送信
  → tool use（respond_to_interview_turn）で type:"question" か type:"done" を強制
  → done になったら:
      1. applyDeterministicScoring() でスコア・必須ゲートをサーバー側が上書き
      2. interview_submissions に1行 INSERT（結果はJSONBで丸ごと保存）
      3. interview_chat_sessions.status を completed に、submission_id を紐付け
      4. access_grants.submission_id にも紐付け（以後そのコードで進捗画面に入れる）

/progress/[id]
  → 総合／カテゴリ別充足率、必須ゲート未達業務、後任者確認パネルを表示
  → ここから後任者確認用リンク（/successor/<code>）を発行できる

/preview/[id] → 内容を編集 → PATCH /api/interview/[id] で保存
/export/[id]  → GET /api/interview/[id]/export?format=docx|pdf でダウンロード

/successor/<code>（後任者・認証Cookie不要）
  → 業務ごとに「対応できる／質問がある」を記録
  → 質問は進捗画面から前任者・運営者が回答（在籍中に解消することを想定）
```

### 3.2 AI呼び出しの構造化出力（tool use 強制）

プロンプト指示だけに頼ると、モデルが自然文で応答してJSONとして解析できないことが
あったため、Anthropic の **tool use を `tool_choice` で強制**している
（`lib/anthropic.ts` の `CHAT_TOOL` / `BATCH_TOOL`）。

- 呼び出し結果は必ず zod スキーマ（`lib/schema.ts`）で検証する。
- スキーマ不一致・tool_use欠落時は `callToolWithRetry()` が最大3回まで自動リトライする。
  2回目以降は、直前の失敗を Anthropic の `tool_result`（`is_error: true`）として
  会話履歴に積み、「何が具体的に間違っていたか」をモデルにフィードバックしてから
  再試行する（盲目的な再送はしない。詳細は `runbook.md` の既知障害①②参照）。
- スコア・必須ゲート判定はAIの自己申告を一切信用せず、`lib/scoring.ts` が
  `insufficient_items` から決定的に再計算してサーバー側で上書きする
  （属人性・モデルの気まぐれを排除するため）。

### 3.3 業務の性格による質問分岐（business_type）

全ての業務を同じ粒度で手順化しようとすると、判断中心の業務（交渉・リーガル
チェック等）では無理が生じるため、業務ごとに `routine`（管理系・定型）／
`contextual`（企画系・非定型）を分類し、質問設計を分岐している
（`lib/prompts/chat-system-prompt.ts` 参照）。この分類は `insufficient_items`
の判定基準にも影響する（`lib/schema.ts` の `BusinessTypeSchema`）。

## 4. 認証・認可モデル

3種類のアクセス主体があり、いずれも「Cookie or URLに埋め込まれた固有コード」で
区別する（アカウント登録・パスワードによる認証は行っていない）。

| 主体 | 識別方法 | アクセス範囲 |
|---|---|---|
| 運営者 | `ACCESS_CODE` 環境変数と一致するマスターコード（Cookie: `hikitsugi_access`） | 全データ・`/admin` 等の管理画面 |
| 対象者（顧客） | `access_grants.code`（Cookie: `hikitsugi_grant`） | 自分の案件（1 grant = 1 submission）のみ |
| 後任者 | `successor_reviews.code`（URLパスに直接埋め込み、Cookie不要） | 紐付いた1件の引継書の内容と、自分の確認状況のみ |

認可ロジックの実体は `lib/authServer.ts` の `getCurrentAuth()` /
`canAccessSubmission()`。ルーティングレベルのゲートは `middleware.ts`
（`PUBLIC_PATHS` / `ADMIN_ONLY_PREFIXES`）。新しい画面・APIを追加する際は、
このどちらに属するかを必ず middleware.ts に反映すること（反映漏れは
「本来ログイン必須のはずが誰でも見える」事故に直結する）。

## 5. 外部サービス・実行環境

| サービス | 用途 | 備考 |
|---|---|---|
| Vercel | ホスティング（Next.js） | Hobbyプラン。関数タイムアウトは `maxDuration`（現状300秒＝プラン上限付近）で明示指定が必要。既定値に頼ると短すぎてタイムアウトする（runbook.md 既知障害①） |
| Anthropic API | AIインタビュー・分析 | `ANTHROPIC_MODEL` 環境変数でモデルIDを上書き可能（既定 `claude-sonnet-5`） |
| Supabase | Postgres DB | 無料プランは非アクティブ時に自動停止（pause）する。停止中はDB系APIがタイムアウトする（runbook.md 既知障害③） |

## 6. このドキュメントの更新方針

スキーマ・画面・認可モデルに変更を加えたら、このファイルと `database.md` /
`api.md` を同じPRで更新する。実装と乖離したアーキテクチャ図は害の方が大きいので、
更新が追いつかない場合は該当箇所に一時的に「要更新」と明記しておくこと。
