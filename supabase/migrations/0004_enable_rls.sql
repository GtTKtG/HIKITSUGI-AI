-- Row Level Security を有効化する（ポリシーは追加しない）。
-- アプリはサーバー側から service role key のみで接続するため RLS は常にバイパスされ、
-- 機能に影響はない。一方で anon / authenticated ロールからのアクセスは全面ブロックされる。
alter table public.interview_submissions enable row level security;
