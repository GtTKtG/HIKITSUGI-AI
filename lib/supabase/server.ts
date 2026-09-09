import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバー専用の Supabase クライアント（service role key を使用）。
 * このモジュールはブラウザ側にバンドルしないこと（API Route / server component 専用）。
 *
 * 認証は優先順位1の段階では未実装。本番の顧客データを扱う前に、
 * 仕様書4章（顧客ごとのデータ分離・保存期間・削除機能）を必ず実装すること。
 */
let client: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    // DB未設定でもAPI自体は動作させる（優先順位1: DB・認証は最小限）。
    return null;
  }

  if (!client) {
    client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
