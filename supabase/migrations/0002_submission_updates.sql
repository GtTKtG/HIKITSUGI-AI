-- HIKITSUGI AI — 優先順位2: 進捗／プレビュー／出力画面のための追加カラム
--
-- 引継書プレビュー画面で本人が修正した内容を保持するため updated_at を追加する。
-- result 列自体（jsonb）を編集後の内容で上書きする運用とする。

alter table interview_submissions
  add column if not exists updated_at timestamptz not null default now();

-- 更新時に updated_at を自動更新する
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_interview_submissions_updated_at on interview_submissions;
create trigger trg_interview_submissions_updated_at
  before update on interview_submissions
  for each row
  execute function set_updated_at();
