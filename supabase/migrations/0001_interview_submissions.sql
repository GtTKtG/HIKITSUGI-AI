-- HIKITSUGI AI — 優先順位1: 最小限のDB
--
-- interview_submissions は「1回のインタビュー処理結果」を1行で保持する。
-- 企業管理（companies）テーブルや認証は優先順位2以降で追加する。
-- 本番の顧客データを扱う前に、仕様書4章（顧客ごとのデータ分離・保存期間・削除機能）を
-- 必ず実装すること。

create extension if not exists "pgcrypto";

create table if not exists interview_submissions (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  employee_name text,
  interview_round integer not null check (interview_round between 1 and 3),
  transcript text not null,
  result jsonb not null,
  overall_score integer check (overall_score between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists idx_interview_submissions_created_at
  on interview_submissions (created_at desc);

comment on table interview_submissions is
  'HIKITSUGI AI: 1回のインタビュー文字起こし処理（構造化・不足検知・スコア算出）の結果。優先順位1の最小スキーマ。';
