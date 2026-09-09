import Anthropic from "@anthropic-ai/sdk";
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
];

const businessSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "業務名" },
    frequency: { type: ["string", "null"], description: "頻度" },
    trigger: { type: ["string", "null"], description: "開始条件" },
    steps: { type: "array", items: { type: "string" }, description: "具体的手順" },
    judgment: { type: ["string", "null"], description: "判断ポイント" },
    exception: { type: ["string", "null"], description: "例外・イレギュラー対応" },
    failure: { type: ["string", "null"], description: "失敗時対応" },
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
      description: "関係者",
    },
    systems: { type: ["string", "null"], description: "使用ファイル・システム" },
    score: { type: "integer", minimum: 0, maximum: 100, description: "充足率スコア（0-100）" },
    insufficient_items: {
      type: "array",
      items: { type: "string", enum: insufficientItemEnum },
    },
    human_follow_up_note: { type: ["string", "null"] },
  },
  required: [
    "name",
    "frequency",
    "trigger",
    "steps",
    "judgment",
    "exception",
    "failure",
    "stakeholders",
    "systems",
    "score",
    "insufficient_items",
    "human_follow_up_note",
  ],
} as const;

const unfinishedCaseSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    progress: { type: ["string", "null"] },
    next_action: { type: ["string", "null"] },
    deadline: { type: ["string", "null"] },
  },
  required: ["name", "progress", "next_action", "deadline"],
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
  return block.input;
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
  const anthropic = getClient();

  const userMessage = [
    `インタビュー回数（interview_round）: ${interviewRound}`,
    "",
    "# 文字起こし本文",
    transcript,
  ].join("\n");

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 8192,
      system: HIKITSUGI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [BATCH_TOOL],
      tool_choice: { type: "tool", name: BATCH_TOOL_NAME },
    });
  } catch (err) {
    throw new InterviewProcessingError("Anthropic API の呼び出しに失敗しました", err);
  }

  const input = extractToolInput(response, BATCH_TOOL_NAME);

  const result = InterviewResultSchema.safeParse(input);
  if (!result.success) {
    throw new InterviewProcessingError(
      `Claude の応答が期待するスキーマと一致しません: ${result.error.message}`,
      result.error
    );
  }

  return result.data;
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
  const anthropic = getClient();

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

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 8192,
      system: HIKITSUGI_CHAT_SYSTEM_PROMPT,
      messages,
      tools: [CHAT_TOOL],
      tool_choice: { type: "tool", name: CHAT_TOOL_NAME },
    });
  } catch (err) {
    throw new InterviewProcessingError("Anthropic API の呼び出しに失敗しました", err);
  }

  const input = extractToolInput(response, CHAT_TOOL_NAME);

  const result = ChatTurnResponseSchema.safeParse(input);
  if (!result.success) {
    throw new InterviewProcessingError(
      `Claude の応答が期待するスキーマと一致しません: ${result.error.message}`,
      result.error
    );
  }

  return result.data;
}
