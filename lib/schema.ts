import { z } from "zod";

/**
 * 仕様書 7.2 のJSON出力フォーマットに対応する zod スキーマ。
 * Claude からの応答をパース・検証する（アプリ内部での取り回し・保存にも使う）。
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
]);

export const StakeholderSchema = z.object({
  role: z.string(),
  name: z.string(),
  note: z.string().nullable().optional(),
});

/**
 * 「使用ファイル・システム」1件あたりの詳細（仕様変更：URL・ID・PW・マニュアル・
 * 関連ファイルの保存場所まで踏み込んで聞く）。
 *
 * password はヒアリングで得られた値をそのまま平文で記録する運用とする
 * （対象者・依頼企業の合意のもとでの仕様。DB・書き出しファイル・メール等に
 * 平文で残る点は運用上の注意点として認識しておくこと）。
 */
export const SystemDetailSchema = z.object({
  name: z.string(),
  url: z.string().nullable(),
  login_id: z.string().nullable(),
  password: z.string().nullable(),
  manual_location: z.string().nullable(),
  file_location: z.string().nullable(),
  note: z.string().nullable(),
});
export type SystemDetail = z.infer<typeof SystemDetailSchema>;

export const BusinessSchema = z.object({
  name: z.string(),
  frequency: z.string().nullable(),
  trigger: z.string().nullable(),
  steps: z.array(z.string()),
  judgment: z.string().nullable(),
  exception: z.string().nullable(),
  failure: z.string().nullable(),
  stakeholders: z.array(StakeholderSchema),
  // システム名の一覧（旧仕様との互換用の要約。表示用に残す）
  systems: z.string().nullable(),
  // システムごとの詳細（新規）。旧データには存在しないため、欠落時は空配列にする。
  system_details: z.array(SystemDetailSchema).optional().default([]),
  score: z.number().min(0).max(100),
  insufficient_items: z.array(InsufficientItemSchema),
  human_follow_up_note: z.string().nullable(),
});

export const UnfinishedCaseSchema = z.object({
  name: z.string(),
  progress: z.string().nullable(),
  next_action: z.string().nullable(),
  deadline: z.string().nullable(),
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
