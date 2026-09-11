import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { HIKITSUGI_SYSTEM_PROMPT } from "@/lib/prompts/system-prompt";
import { HIKITSUGI_CHAT_SYSTEM_PROMPT } from "@/lib/prompts/chat-system-prompt";
import {
  InterviewResultSchema,
  type InterviewResult,
  ChatTurnResponseSchema,
  type ChatTurnResponse,
  type ChatMessage,
} from "@/lib/schema";

/**
 * バックエンドの構成（仕様書 7.3・7.4）
 *   フロントエンド（文字起こし／チャット発言を送信）
 *     → バックエンドサーバー（APIキーを保管、systemプロンプトを付与）
 *       → Anthropic API（Claude呼び出し、tool useで構造化出力を強制）
 *
 * APIキーはサーバー側の環境変数にのみ保管し、フロントエンドには一切渡さない。
 * AIゲートウェイは使わず、Anthropic API を直接呼び出す。
 *
 * 出力形式は「JSON以外を出力しない」というプロンプト指示だけに頼らず、
 * Anthropic の tool use（tool_choice で特定ツールの呼び出しを強制）を使って
 * 構造化出力そのものを強制する。プロンプト指示だけの場合、モデルが
 * （特に対話が続く中で）自然文で応答してしまいJSONとして解析できないことが
 * あったため、この方式に変更した。
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY が設定されていません（サーバー環境変数）");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// 既定モデル。環境変数 ANTHROPIC_MODEL で上書き可能。
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export class InterviewProcessingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "InterviewProcessingError";
  }
}

/* ------------------------------------------------------------------ */
/* tool の入力スキーマ（JSON Schema）。lib/schema.ts の zod 定義と同じ形。  */
/* ------------------------------------------------------------------ */

const insufficientItemEnum = [
  "frequency",
  "trigger",
  "steps",
  "judgment",
  "exception",
  "failure",
  "stakeholders",
  "systems",
  "purpose",
  "deadline",
  "deliverables",
  "access_handover",
];

// パスワードそのものは聞かない・出力させない（改善方針8章）。
// ログイン方法・権限・端末制限・電子証明書・申請先・代理者を聞く。
const systemDetailSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "システム・ファイル名" },
    url: { type: ["string", "null"], description: "アクセスURL（ログインページ等）" },
    login_id: { type: ["string", "null"], description: "ログインID・アカウント名" },
    login_method: { type: ["string", "null"], description: "利用機能・ログイン方法" },
    permission: { type: ["string", "null"], description: "権限（付与されているロール・アクセス範囲）" },
    device_restriction: { type: ["string", "null"], description: "端末制限（特定端末・VPN必須 等）" },
    certificate: { type: ["string", "null"], description: "電子証明書の要否・保管場所" },
    application_destination: { type: ["string", "null"], description: "アカウント申請先（部署・担当者）" },
    proxy: { type: ["string", "null"], description: "代理者（本人不在時に対応できる人）" },
    manual_location: {
      type: ["string", "null"],
      description: "操作マニュアルの保管場所・ファイル名（例：共有フォルダのパス、ファイル名）",
    },
    file_location: {
      type: ["string", "null"],
      description: "そのシステムに関連するファイルの保存場所・ファイル名",
    },
    note: { type: ["string", "null"], description: "その他の補足（引き継ぎ時の注意点等）" },
  },
  required: [
    "name",
    "url",
    "login_id",
    "login_method",
    "permission",
    "device_restriction",
    "certificate",
    "application_destination",
    "proxy",
    "manual_location",
    "file_location",
    "note",
  ],
} as const;

const businessSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "業務名（成果物単位まで分解されていること）" },
    purpose: { type: ["string", "null"], description: "業務の目的・対象・位置づけ" },
    frequency: { type: ["string", "null"], description: "頻度・実施時期" },
    trigger: { type: ["string", "null"], description: "開始条件" },
    deadline: { type: ["string", "null"], description: "法定・社内期限、実務上の着手時期" },
    steps: { type: "array", items: { type: "string" }, description: "具体的手順" },
    deliverables: {
      type: ["string", "null"],
      description: "成果物（正本・テンプレート・命名規則・保存場所）",
    },
    judgment: { type: ["string", "null"], description: "判断ポイント" },
    exception: { type: ["string", "null"], description: "例外・イレギュラー対応" },
    failure: { type: ["string", "null"], description: "失敗時対応・緊急時の初動" },
    stakeholders: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          name: { type: "string" },
          note: { type: ["string", "null"] },
        },
        required: ["role", "name"],
      },
      description: "関係者（実務担当・確認者・承認者・提出者・代理者）",
    },
    systems: { type: ["string", "null"], description: "使用ファイル・システム名の一覧（要約）" },
    system_details: {
      type: "array",
      items: systemDetailSchema,
      description: "使用ファイル・システムごとの詳細",
    },
    access_handover: {
      type: ["string", "null"],
      description: "権限移管状況（後任者への付与状況・前任者権限の停止日・未完了の申請）",
    },
    score: { type: "integer", minimum: 0, maximum: 100, description: "参考値。最終的にはサーバー側で再計算する" },
    insufficient_items: {
      type: "array",
      items: { type: "string", enum: insufficientItemEnum },
    },
    human_follow_up_note: { type: ["string", "null"] },
  },
  required: [
    "name",
    "purpose",
    "frequency",
    "trigger",
    "deadline",
    "steps",
    "deliverables",
    "judgment",
    "exception",
    "failure",
    "stakeholders",
    "systems",
    "system_details",
    "access_handover",
    "score",
    "insufficient_items",
    "human_follow_up_note",
  ],
} as const;

const unfinishedCaseSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    progress: { type: ["string", "null"], description: "現在のステータスとここまでに決まったこと" },
    next_action: { type: ["string", "null"] },
    deadline: { type: ["string", "null"], description: "最終期限" },
    purpose_scope: { type: ["string", "null"], description: "案件の目的・対象範囲・背景" },
    open_issues: { type: ["string", "null"], description: "未決事項・懸念事項・依存関係" },
    owner: { type: ["string", "null"], description: "主担当者" },
    decision_maker: { type: ["string", "null"], description: "意思決定者" },
    counterpart: { type: ["string", "null"], description: "相手方の窓口" },
    related_materials_location: { type: ["string", "null"], description: "関連資料・最新の打合せ記録の所在" },
    impact_if_neglected: { type: ["string", "null"], description: "放置・遅延した場合の影響" },
    completion_condition: { type: ["string", "null"], description: "完了条件" },
    completion_confirmer: { type: ["string", "null"], description: "完了を確認する者" },
    next_review_date: { type: ["string", "null"], description: "次回予定日" },
  },
  required: [
    "name",
    "progress",
    "next_action",
    "deadline",
    "purpose_scope",
    "open_issues",
    "owner",
    "decision_maker",
    "counterpart",
    "related_materials_location",
    "impact_if_neglected",
    "completion_condition",
    "completion_confirmer",
    "next_review_date",
  ],
} as const;

const BATCH_TOOL_NAME = "submit_interview_result";
const BATCH_TOOL: Anthropic.Tool = {
  name: BATCH_TOOL_NAME,
  description:
    "構造化・不足検知済みの引継書データを提出する。文字起こしの解析結果はすべてこのツール経由で返すこと。",
  input_schema: {
    type: "object",
    properties: {
      businesses: { type: "array", items: businessSchema },
      unfinished_cases: { type: "array", items: unfinishedCaseSchema },
      closing_message: { type: ["string", "null"] },
      re_questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            business: { type: "string" },
            item: { type: "string" },
            question: { type: "string" },
          },
          required: ["business", "item", "question"],
        },
      },
      interview_round: { type: "integer", minimum: 1 },
    },
    required: ["businesses", "unfinished_cases", "closing_message", "re_questions", "interview_round"],
  },
};

const CHAT_TOOL_NAME = "respond_to_interview_turn";
const CHAT_TOOL: Anthropic.Tool = {
  name: CHAT_TOOL_NAME,
  description:
    "対象者への次のメッセージ（質問または聞き返し）を返す。全項目のヒアリングが完了した場合のみ " +
    "type を done にし、result に構造化済みの引継書データを入れる。それ以外（会話継続中）は " +
    "type を question にし、result は null にする。すべての応答はこのツール経由で返すこと。",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["question", "done"] },
      message: { type: "string", description: "対象者に見せるメッセージ" },
      result: {
        type: ["object", "null"],
        description: "type が done の場合のみ、構造化済みの引継書データを入れる。question の場合は null。",
        properties: {
          businesses: { type: "array", items: businessSchema },
          unfinished_cases: { type: "array", items: unfinishedCaseSchema },
          closing_message: { type: ["string", "null"] },
        },
        required: ["businesses", "unfinished_cases", "closing_message"],
      },
    },
    required: ["type", "message", "result"],
  },
};

function extractToolInput(response: Anthropic.Message, toolName: string): unknown {
  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
  if (!block) {
    throw new InterviewProcessingError("Claude がツール呼び出しで応答しませんでした");
  }
  return normalizeEscapedText(block.input);
}

/**
 * Claude が改行のつもりで、実際の改行文字ではなく `\n` という2文字（バックスラッシュ+n）を
 * そのまま出力することがあるため、tool の入力（文字列すべて）を再帰的に正規化する。
 * `\r\n` `\t` も同様に扱う。
 */
function normalizeEscapedText(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  }
  if (Array.isArray(value)) {
    return value.map(normalizeEscapedText);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeEscapedText(v)])
    );
  }
  return value;
}

const MAX_ATTEMPTS = 3;

/**
 * Claude をtool use付きで呼び出し、指定したツールの入力を zod スキーマで検証して返す。
 * モデルが稀に enum/discriminator から外れた値等、スキーマに合わない出力をすることが
 * あるため、失敗した場合は同じリクエストを最大 MAX_ATTEMPTS 回まで再試行する
 * （文字起こし・会話履歴が長い/複雑な場合にまれに発生する一時的な不具合であり、
 * 再試行すれば直ることが多い）。
 */
async function callToolWithRetry<T>(params: {
  label: string;
  request: Anthropic.MessageCreateParamsNonStreaming;
  toolName: string;
  // Def/Input は any にして、system_details のように .default() で
  // Input（省略可）と Output（常に配列）が異なるスキーマも渡せるようにする。
  schema: ZodType<T, any, any>;
}): Promise<T> {
  const anthropic = getClient();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create(params.request);
    } catch (err) {
      lastError = new InterviewProcessingError("Anthropic API の呼び出しに失敗しました", err);
      console.error(`[${params.label}] attempt ${attempt}/${MAX_ATTEMPTS} API call failed`, err);
      continue;
    }

    let input: unknown;
    try {
      input = extractToolInput(response, params.toolName);
    } catch (err) {
      lastError = err;
      console.error(`[${params.label}] attempt ${attempt}/${MAX_ATTEMPTS} no tool_use block`, err);
      continue;
    }

    const result = params.schema.safeParse(input);
    if (result.success) {
      return result.data;
    }

    lastError = new InterviewProcessingError(
      `Claude の応答が期待するスキーマと一致しません: ${result.error.message}`,
      result.error
    );
    // 原因調査のため、スキーマに合わなかった生の入力をログに残す
    // （個人情報を含みうるため、長さは適度に切り詰める）。
    console.error(
      `[${params.label}] attempt ${attempt}/${MAX_ATTEMPTS} schema mismatch`,
      result.error.message,
      "raw input:",
      JSON.stringify(input).slice(0, 2000)
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new InterviewProcessingError("Anthropic API の呼び出しに失敗しました", lastError);
}

/**
 * 文字起こし本文とインタビュー回数を Claude に渡し、仕様書7.2のJSON形式で
 * 構造化・不足検知・再質問生成・充足率スコア算出まで行った結果を返す。
 */
export async function processInterviewTranscript(params: {
  transcript: string;
  interviewRound: number;
}): Promise<InterviewResult> {
  const { transcript, interviewRound } = params;

  const userMessage = [
    `インタビュー回数（interview_round）: ${interviewRound}`,
    "",
    "# 文字起こし本文",
    transcript,
  ].join("\n");

  return callToolWithRetry({
    label: "interview/process",
    toolName: BATCH_TOOL_NAME,
    schema: InterviewResultSchema,
    request: {
      model: DEFAULT_MODEL,
      max_tokens: 8192,
      system: HIKITSUGI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [BATCH_TOOL],
      tool_choice: { type: "tool", name: BATCH_TOOL_NAME },
    },
  });
}

/**
 * チャット版AIインタビュー（仕様書5章・7.1・7.2）の1ターンを処理する。
 * これまでの会話履歴（messages）に、対象者の新しい発言（userMessage、初回はなし）を
 * 加えて Claude に渡し、次の質問（question）または完了時の構造化データ（done）を返す。
 */
export async function runChatTurn(params: {
  history: ChatMessage[];
  userMessage?: string;
}): Promise<ChatTurnResponse> {
  const { history, userMessage } = params;

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }
  if (messages.length === 0) {
    // 最初のターン：対象者の発言がまだないため、開始を促す短いメッセージを送る。
    messages.push({ role: "user", content: "（インタビューを開始してください）" });
  }

  return callToolWithRetry({
    label: "interview/chat/turn",
    toolName: CHAT_TOOL_NAME,
    schema: ChatTurnResponseSchema,
    request: {
      model: DEFAULT_MODEL,
      max_tokens: 8192,
      system: HIKITSUGI_CHAT_SYSTEM_PROMPT,
      messages,
      tools: [CHAT_TOOL],
      tool_choice: { type: "tool", name: CHAT_TOOL_NAME },
    },
  });
}
