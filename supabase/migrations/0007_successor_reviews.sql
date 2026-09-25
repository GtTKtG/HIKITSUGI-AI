-- HIKITSUGI AI — 後任者による再現性確認（仕様書5.3）
--
-- 引継書が完成しても、後任者が実際に読んで「これで対応できるか」を検証しない限り、
-- 記載内容が本当に業務を再現できる水準かは分からない。前任者の退職前に、後任者へ
-- 専用リンクを発行し、業務ごとに「対応できる／質問がある」を確認してもらう。
-- 質問は前任者・運営者が在籍中に回答できるよう、同じレコードに蓄積する。

create table if not exists successor_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references interview_submissions(id),
  code text not null unique,
  successor_name text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  -- 業務ごとの確認状況の配列：
  -- [{ business_name, status: "unreviewed"|"confirmed"|"question", question, answer, answered_at }]
  items jsonb not null default '[]'::jsonb,
  overall_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_successor_reviews_code on successor_reviews (code);
create index if not exists idx_successor_reviews_submission_id on successor_reviews (submission_id);

drop trigger if exists trg_successor_reviews_updated_at on successor_reviews;
create trigger trg_successor_reviews_updated_at
  before update on successor_reviews
  for each row
  execute function set_updated_at();

alter table successor_reviews enable row level security;

comment on table successor_reviews is
  'HIKITSUGI AI: 後任者が引継書の内容を業務ごとに確認し「対応できる／質問がある」を記録する。前任者・運営者はitems内のquestionに対しanswerを記録して回答する。';
