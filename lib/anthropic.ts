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
 * バックエンドの構成（仕様書 7.3）
 *   フロントエンド（文字起こしを送信）
 *     → バックエンドサーバー（APIキーを保管、systemプロンプトを付与、JSON受信）
 *       → Anthropic API（Claude呼び出し）
 *
 * APIキーはサーバー側の環境変数にのみ保管し、フロントエンドには一切渡さない。
 * AIゲートウェイは使わず、Anthropic API を直接呼び出す。
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

  let response;
  try {
    response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 8192,
      system: HIKITSUGI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    throw new InterviewProcessingError("Anthropic API の呼び出しに失敗しました", err);
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new InterviewProcessingError("Claude からテキスト応答が得られませんでした");
  }

  const raw = extractJson(textBlock.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InterviewProcessingError("Claude の応答をJSONとして解析できませんでした", err);
  }

  const result = InterviewResultSchema.safeParse(parsed);
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

  let response;
  try {
    response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 8192,
      system: HIKITSUGI_CHAT_SYSTEM_PROMPT,
      messages,
    });
  } catch (err) {
    throw new InterviewProcessingError("Anthropic API の呼び出しに失敗しました", err);
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new InterviewProcessingError("Claude からテキスト応答が得られませんでした");
  }

  const raw = extractJson(textBlock.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InterviewProcessingError("Claude の応答をJSONとして解析できませんでした", err);
  }

  const result = ChatTurnResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new InterviewProcessingError(
      `Claude の応答が期待するスキーマと一致しません: ${result.error.message}`,
      result.error
    );
  }

  return result.data;
}

/**
 * Claude の応答からJSON本体を取り出す。
 * プロンプトでコードフェンス禁止を指示しているが、念のため ```json ... ``` で
 * 囲まれて返ってきた場合にも対応する。
 */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}
