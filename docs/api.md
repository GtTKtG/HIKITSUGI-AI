# API仕様書

対象：`app/api/**/route.ts`。認可列の記号は以下の通り（実体は `lib/authServer.ts` /
`middleware.ts`）。

- **公開**：認証Cookie不要。URL中の固有コード自体がゲート（`/enter`, `/successor` と同じ扱い）
- **運営者**：`ACCESS_CODE` によるマスターコードでログイン必須
- **運営者 or grant**：運営者、または対象の案件に紐づく顧客固有コード（access_grants）でアクセス中の場合のみ

すべてのRoute Handlerは `export const runtime = "nodejs";`（Edge runtimeでは動かない。
Anthropic SDK・Supabaseクライアント・PDF生成等がNode API前提のため）。

## 認証

### `POST /api/auth/login` — 公開

運営者マスターコード、または顧客固有コードでログインする（`/enter/<code>` の代替手段）。

```json
// request
{ "code": "文字列" }
// response 200
{ "ok": true, "kind": "admin" }
// または
{ "ok": true, "kind": "grant", "redirect": "/progress/<submission_id>" | "/interview" }
// response 401
{ "error": "コードが正しくありません" }
```

### `POST /api/auth/logout` — 公開

運営者Cookie（`hikitsugi_access`）を破棄する。

### `GET /api/auth/me` — 公開（認証状態に応じて中身が変わる）

現在の認証状態を返す。grantでアクセス中なら、会社名・対象者名・完了済みsubmission_id・
進行中チャットセッションの会話履歴まで含めて返す（`/interview` 画面の再読み込み復元用）。

```json
{ "kind": "admin" | "grant" | "none",
  "company_name"?: "string|null", "employee_name"?: "string|null",
  "submission_id"?: "string|null", "session_id"?: "string|null", "messages"?: [] }
```

## 案件管理（運営者専用）

### `GET /api/admin/grants` — 運営者

発行済みの顧客固有コード一覧を新しい順に返す。`{ "grants": AccessGrant[] }`

### `POST /api/admin/grants` — 運営者

案件を新規作成し、固有コードを発行する。

```json
// request（両方任意）
{ "company_name": "string", "employee_name": "string" }
// response
{ "grant": { "id", "code", "company_name", "employee_name", "chat_session_id": null,
             "submission_id": null, "created_at", "redeemed_at": null } }
```

## AIインタビュー

### `POST /api/interview/chat/turn` — 運営者 or grant（本線）

チャット版インタビューの1ターン。`maxDuration = 300`。

```json
// request
{ "session_id"?: "uuid（初回省略可）", "message"?: "対象者の発言（初回省略可）",
  "company_name"?: "string（初回のみ・非grant時）", "employee_name"?: "string（同上）" }
// response（継続中）
{ "session_id": "uuid", "done": false, "message": "AIからの次の質問" }
// response（完了）
{ "session_id": "uuid", "done": true, "message": "完了メッセージ", "submission_id": "uuid|null" }
```

内部で `runChatTurn()`（`lib/anthropic.ts`）→ `applyDeterministicScoring()`
（`lib/scoring.ts`）→ `createSubmission()` の順に処理し、grantアクセス時は
`access_grants` にも自動で紐付ける。エラー時は `502`（Anthropic呼び出し失敗）
または `500`。

### `POST /api/interview/process` — 運営者専用（代替運用）

文字起こし全文を一括投入するバッチ版。`maxDuration = 300`。

```json
// request
{ "transcript": "string（必須）", "interview_round": 1, // 1〜3、省略時1
  "company_name"?: "string", "employee_name"?: "string" }
// response
{ "submission_id": "uuid|null", "overall_score": number|null, "result": InterviewResult }
```

## 結果の取得・編集・出力（運営者 or grant、対象submissionと一致する場合のみ）

### `GET /api/interview/[id]`

保存済み結果を返す。`{ "submission": InterviewSubmissionRow }`

### `PATCH /api/interview/[id]`

プレビュー画面での編集内容（`InterviewResultSchema` 全体）を上書き保存する。
リクエストボディがスキーマに合わない場合は `400` + zodのflattenされたエラー詳細。

### `GET /api/interview/[id]/export?format=docx|pdf`

Word（`.docx`）またはPDFを生成してダウンロードさせる。`format` 省略時は `docx`。
ファイル名は `引継書_<対象者名 or submission_idの先頭8桁>.<拡張子>`。

## 後任者による再現性確認（仕様書5.3）

### `GET /api/interview/[id]/successor-review` — 運営者 or grant

この引継書に対して発行済みの後任者確認レコード一覧。`{ "reviews": SuccessorReviewRow[] }`

### `POST /api/interview/[id]/successor-review` — 運営者 or grant

後任者確認用の新しいコード（専用リンク）を発行する。対象引継書の全業務名・全未完了案件名で
`items` を初期化する（`kind: "business" | "unfinished_case"`）。業務・未完了案件が
両方とも0件の場合は `400`。

```json
// request（任意）
{ "successor_name"?: "string" }
// response
{ "review": SuccessorReviewRow }
```

### `PATCH /api/interview/[id]/successor-review` — 運営者 or grant

`action` 省略時（既定）：後任者からの質問に、前任者・運営者が回答する。

```json
// request
{ "review_id": "uuid", "business_name": "string", "kind"?: "business" | "unfinished_case", "answer": "string" }
// response
{ "review": SuccessorReviewRow }
```

`action: "reflect"`：回答済みの質問を、対象業務の `human_follow_up_note` へ追記し
`items[].reflected` を立てる（改善計画フェーズ0・Q29）。現状 `kind: "business"` のみ対応
（未完了案件には反映先フィールドが無いため `400`）。

```json
// request
{ "review_id": "uuid", "business_name": "string", "action": "reflect" }
// response
{ "review": SuccessorReviewRow }
```

### `GET /api/successor/[code]` — 公開

後任者が確認画面を開いた際に、対象引継書の内容と自分の確認状況を取得する。

```json
{ "review": SuccessorReviewRow,
  "submission": { "id", "company_name", "employee_name",
    "businesses": Business[], "unfinished_cases": UnfinishedCase[] } }
```

コードが存在しない場合は `404`。

### `POST /api/successor/[code]` — 公開

業務1件ごとの確認結果を記録する、または確認完了を記録する。

```json
// 業務1件の確認
{ "action": "item", "business_name": "string",
  "status": "confirmed" | "question", "question"?: "string（status=questionなら必須）" }
// 確認完了
{ "action": "complete", "overall_comment"?: "string", "successor_name"?: "string" }
// いずれも response
{ "review": SuccessorReviewRow }
```

## `/enter/[code]` — 公開（GET, 画面遷移用でJSONは返さない）

顧客固有コードのワンクリック入場リンク。正しければ `hikitsugi_grant` Cookieを発行し、
未着手なら `/interview`、完了済みなら `/progress/[id]` へ302リダイレクトする。
不正なコードは `/login?error=invalid_code` へリダイレクト。

## エラーレスポンスの共通形

DB未設定（`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 未設定）の場合は多くのAPIが
`503` + `{ "error": "Supabase が未設定のため..." }` を返す。それ以外の未捕捉エラーは
`500` + `{ "error": "予期しないエラーが発生しました" }`（詳細はVercelのランタイムログ
に出力。`runbook.md` の調査手順を参照）。
