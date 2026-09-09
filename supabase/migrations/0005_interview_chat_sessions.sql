-- HIKITSUGI AI — チャット版AIインタビュー（新仕様書5章・7章）
--
-- interview_chat_sessions は、対象者とAIのターン単位の会話状態を保持する。
-- 会話が完了すると、7.2のJSON結果を interview_submissions に1行として書き出し、
-- 既存の進捗／プレビュー／出力画面（/progress, /preview, /export）をそのまま
-- 再利用する（submission_id で紐付ける）。

create table if not exists interview_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  employee_name text,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  messages jsonb not null default '[]'::jsonb,
  submission_id uuid references interview_submissions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_interview_chat_sessions_status
  on interview_chat_sessions (status);

drop trigger if exists trg_interview_chat_sessions_updated_at on interview_chat_sessions;
create trigger trg_interview_chat_sessions_updated_at
  before update on interview_chat_sessions
  for each row
  execute function set_updated_at();

alter table interview_chat_sessions enable row level security;

comment on table interview_chat_sessions is
  'HIKITSUGI AI: チャット版AIインタビューのターン単位の会話状態。完了時にinterview_submissionsへ書き出す。';
