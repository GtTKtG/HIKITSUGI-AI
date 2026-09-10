-- HIKITSUGI AI — 顧客ごとの固有アクセスコード（案件単位のゲート）
--
-- 運営者が案件（対象者1名分の依頼）を作成すると、固有のコードが発行される。
-- 対象者はこのコード付きのURL（/enter/<code>）でアクセスすると、
-- そのコードに紐づくインタビューセッション・結果のみを閲覧・操作できる。
-- 運営者用のマスターコード（ACCESS_CODE環境変数）とは別の仕組み。

create table if not exists access_grants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  company_name text,
  employee_name text,
  chat_session_id uuid references interview_chat_sessions(id),
  submission_id uuid references interview_submissions(id),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create index if not exists idx_access_grants_code on access_grants (code);
create index if not exists idx_access_grants_created_at on access_grants (created_at desc);

alter table access_grants enable row level security;

comment on table access_grants is
  'HIKITSUGI AI: 顧客（対象者）ごとに発行する固有アクセスコード。1コード=1案件（1インタビュー）に対応。';
