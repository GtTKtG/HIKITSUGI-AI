import { z } from "zod";

/**
 * 仕様書 7.2 のJSON出力フォーマットに対応する zod スキーマ。
 * Claude からの応答をパース・検証する（アプリ内部での取り回し・保存にも使う）。
 *
 * 仕様変更（docs/spec.md 5.2「ヒアリング精度の改善」）：
 * 後任者が実際に業務を再現できる水準まで踏み込んでヒアリングするため、項目を
 * 拡張し、業務ごとの充足率を「8カテゴリ・配点100点」の客観採点＋必須ゲート判定
 * （lib/scoring.ts）に切り替えた。旧データ（拡張前のフィールドを持たない）も
 * 引き続き読み込めるよう、追加フィールドはすべて .optional().default(...) にして
 * 後方互換を確保している。
 */

export const InsufficientItemSchema = z.enum([
  "frequency",
  "trigger",
  "steps",
  "judgment",
  "exception",
  "failure",
  "stakeholders",
  "systems",
  // 仕様変更で追加したカテゴリ
  "purpose",
  "deadline",
  "deliverables",
  "access_handover",
]);

export const StakeholderSchema = z.object({
  role: z.string(),
  name: z.string(),
  note: z.string().nullable().optional(),
});

/**
 * 「使用ファイル・システム」1件あたりの詳細。
 *
 * 仕様変更：パスワードそのものは引継書に記載せず、会社が定める安全な方法で
 * 移管する方針に切り替えた（改善方針8章）。password フィールドは過去データ
 * （切り替え前に記録されたもの）を読み込めるように残しているだけで、新規の
 * ヒアリングでは聞かない・埋めない。代わりに、ログイン方法・権限・端末制限・
 * 電子証明書・申請先・代理者を聞く。
 */
export const SystemDetailSchema = z.object({
  name: z.string(),
  url: z.string().nullable(),
  login_id: z.string().nullable(),
  /** @deprecated 新規ヒアリングでは聞かない。過去データ読み込み用に残置。 */
  password: z.string().nullable().optional().default(null),
  login_method: z.string().nullable().optional().default(null), // 利用機能・ログイン方法
  permission: z.string().nullable().optional().default(null), // 権限
  device_restriction: z.string().nullable().optional().default(null), // 端末制限
  certificate: z.string().nullable().optional().default(null), // 電子証明書
  application_destination: z.string().nullable().optional().default(null), // 申請先
  proxy: z.string().nullable().optional().default(null), // 代理者
  manual_location: z.string().nullable(),
  file_location: z.string().nullable(),
  note: z.string().nullable(),
});
export type SystemDetail = z.infer<typeof SystemDetailSchema>;

export const BusinessSchema = z.object({
  name: z.string(),
  // 業務の目的・対象・位置づけ（新規：成果物単位まで分解された業務であることが前提）
  purpose: z.string().nullable().optional().default(null),
  frequency: z.string().nullable(),
  trigger: z.string().nullable(),
  // 法定・社内期限、実務上の着手時期（新規）
  deadline: z.string().nullable().optional().default(null),
  steps: z.array(z.string()),
  // 成果物（正本・テンプレート・命名規則・保存場所）（新規）
  deliverables: z.string().nullable().optional().default(null),
  judgment: z.string().nullable(),
  exception: z.string().nullable(),
  failure: z.string().nullable(),
  stakeholders: z.array(StakeholderSchema),
  // システム名の一覧（旧仕様との互換用の要約。表示用に残す）
  systems: z.string().nullable(),
  // システムごとの詳細。旧データには存在しないため、欠落時は空配列にする。
  system_details: z.array(SystemDetailSchema).optional().default([]),
  // 権限移管状況：後任者への付与状況・前任者権限の停止日・未完了の申請（新規）
  access_handover: z.string().nullable().optional().default(null),
  score: z.number().min(0).max(100),
  insufficient_items: z.array(InsufficientItemSchema),
  human_follow_up_note: z.string().nullable(),
  /**
   * 必須ゲート未達の項目（日本語ラベル）。AIには出力させず、insufficient_items から
   * lib/scoring.ts が決定的に算出してサーバー側で上書きする（表示・保存用）。
   */
  mandatory_gate_missing: z.array(z.string()).optional().default([]),
});

export const UnfinishedCaseSchema = z.object({
  name: z.string(),
  progress: z.string().nullable(),
  next_action: z.string().nullable(),
  deadline: z.string().nullable(),
  // 未完了案件の専用ヒアリング強化（新規、いずれも任意）
  purpose_scope: z.string().nullable().optional().default(null), // 目的・対象範囲・背景
  open_issues: z.string().nullable().optional().default(null), // 未決事項・懸念事項・依存関係
  owner: z.string().nullable().optional().default(null), // 主担当者
  decision_maker: z.string().nullable().optional().default(null), // 意思決定者
  counterpart: z.string().nullable().optional().default(null), // 相手方の窓口
  related_materials_location: z.string().nullable().optional().default(null), // 関連資料・打合せ記録の所在
  impact_if_neglected: z.string().nullable().optional().default(null), // 放置・遅延した場合の影響
  completion_condition: z.string().nullable().optional().default(null), // 完了条件
  completion_confirmer: z.string().nullable().optional().default(null), // 完了を確認する者
  next_review_date: z.string().nullable().optional().default(null), // 次回予定日
});

export const ReQuestionSchema = z.object({
  business: z.string(),
  item: z.string(),
  question: z.string(),
});

export const InterviewResultSchema = z.object({
  businesses: z.array(BusinessSchema),
  unfinished_cases: z.array(UnfinishedCaseSchema),
  closing_message: z.string().nullable(),
  re_questions: z.array(ReQuestionSchema),
  interview_round: z.number().int().min(1),
});

export type InterviewResult = z.infer<typeof InterviewResultSchema>;
export type Business = z.infer<typeof BusinessSchema>;
export type UnfinishedCase = z.infer<typeof UnfinishedCaseSchema>;

/**
 * POST /api/interview/process のリクエストボディ
 */
export const ProcessInterviewRequestSchema = z.object({
  transcript: z.string().min(1, "transcript は必須です"),
  interview_round: z.number().int().min(1).max(3).default(1),
  // 企業管理画面（優先順位2）実装前の暫定フィールド。自由入力の文字列のみで、
  // companies テーブルへの外部キーは持たせない。
  company_name: z.string().optional(),
  employee_name: z.string().optional(),
});

export type ProcessInterviewRequest = z.infer<typeof ProcessInterviewRequestSchema>;

/* ------------------------------------------------------------------ */
/* チャット版AIインタビュー（新仕様書 5章・7章）                         */
/* ------------------------------------------------------------------ */

/** 会話履歴の1メッセージ。Claudeへ毎ターン渡す（7.1）。 */
export const ChatMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * チャット完了時にAIがまとめて出力する構造化データ（仕様書7.2）。
 * バッチ版（InterviewResultSchema）と異なり、ターンごとにその場で聞き返すため
 * re_questions / interview_round は持たない。
 */
export const ChatInterviewResultSchema = z.object({
  businesses: z.array(BusinessSchema),
  unfinished_cases: z.array(UnfinishedCaseSchema),
  closing_message: z.string().nullable(),
});
export type ChatInterviewResult = z.infer<typeof ChatInterviewResultSchema>;

/**
 * ターンごとにClaudeが返す応答の型。会話継続中は type: "question"、
 * 全業務・未完了案件・クロージングまで終わったら type: "done" で
 * 7.2のJSONを一緒に返す。
 */
export const ChatTurnResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("question"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("done"),
    message: z.string(),
    result: ChatInterviewResultSchema,
  }),
]);
export type ChatTurnResponse = z.infer<typeof ChatTurnResponseSchema>;

/** POST /api/interview/chat/turn のリクエストボディ */
export const ChatTurnRequestSchema = z.object({
  session_id: z.string().uuid().optional(),
  message: z.string().optional(),
  company_name: z.string().optional(),
  employee_name: z.string().optional(),
});
export type ChatTurnRequest = z.infer<typeof ChatTurnRequestSchema>;
