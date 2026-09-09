import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ChatMessageSchema, type ChatMessage } from "@/lib/schema";
import { SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import { z } from "zod";

const MessagesArraySchema = z.array(ChatMessageSchema);

export interface ChatSessionRow {
  id: string;
  company_name: string | null;
  employee_name: string | null;
  status: "in_progress" | "completed";
  messages: ChatMessage[];
  submission_id: string | null;
  created_at: string;
  updated_at: string;
}

function parseRow(data: Record<string, unknown>): ChatSessionRow {
  const messages = MessagesArraySchema.parse(data.messages ?? []);
  return { ...data, messages } as ChatSessionRow;
}

export async function createChatSession(params: {
  companyName?: string;
  employeeName?: string;
}): Promise<ChatSessionRow> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("interview_chat_sessions")
    .insert({
      company_name: params.companyName ?? null,
      employee_name: params.employeeName ?? null,
      messages: [],
    })
    .select("*")
    .single();

  if (error) throw error;
  return parseRow(data);
}

export async function getChatSession(id: string): Promise<ChatSessionRow | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("interview_chat_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return parseRow(data);
}

export async function updateChatSessionMessages(
  id: string,
  messages: ChatMessage[]
): Promise<ChatSessionRow> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("interview_chat_sessions")
    .update({ messages })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return parseRow(data);
}

export async function completeChatSession(
  id: string,
  submissionId: string
): Promise<ChatSessionRow> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("interview_chat_sessions")
    .update({ status: "completed", submission_id: submissionId })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return parseRow(data);
}
