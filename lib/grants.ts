import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SubmissionsUnavailableError } from "@/lib/supabase/submissions";

/**
 * 顧客ごとの固有アクセスコード（案件単位のゲート）。
 * 運営者が案件（対象者1名分の依頼）を作成すると発行され、
 * 対象者はこのコードで自分の案件のインタビュー・結果のみにアクセスできる。
 */
export interface AccessGrant {
  id: string;
  code: string;
  company_name: string | null;
  employee_name: string | null;
  chat_session_id: string | null;
  submission_id: string | null;
  created_at: string;
  redeemed_at: string | null;
}

// 見間違えやすい文字（0/O, 1/I/L 等）を除いた読み上げ・手入力しやすい英数字。
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

export async function createGrant(params: {
  companyName?: string;
  employeeName?: string;
}): Promise<AccessGrant> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  // 10文字・32種の英数字なので衝突確率は無視できるほど低いが、念のため数回リトライする。
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from("access_grants")
      .insert({
        code,
        company_name: params.companyName ?? null,
        employee_name: params.employeeName ?? null,
      })
      .select("*")
      .single();

    if (!error) return data as AccessGrant;
    if (!isUniqueViolation(error)) throw error;
  }
  throw new Error("アクセスコードの生成に失敗しました（衝突が続いたため）");
}

export async function listGrants(): Promise<AccessGrant[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("access_grants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as AccessGrant[];
}

export async function getGrantByCode(code: string): Promise<AccessGrant | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { data, error } = await supabase
    .from("access_grants")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  return (data as AccessGrant | null) ?? null;
}

export async function markGrantRedeemed(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { error } = await supabase
    .from("access_grants")
    .update({ redeemed_at: new Date().toISOString() })
    .eq("id", id)
    .is("redeemed_at", null);

  if (error) throw error;
}

export async function linkGrantChatSession(id: string, chatSessionId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { error } = await supabase
    .from("access_grants")
    .update({ chat_session_id: chatSessionId })
    .eq("id", id);

  if (error) throw error;
}

export async function linkGrantSubmission(id: string, submissionId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new SubmissionsUnavailableError();

  const { error } = await supabase
    .from("access_grants")
    .update({ submission_id: submissionId })
    .eq("id", id);

  if (error) throw error;
}
