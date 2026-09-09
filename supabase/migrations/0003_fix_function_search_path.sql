-- セキュリティ堅牢化: set_updated_at() の search_path を固定する
-- （Supabase Advisor: function_search_path_mutable, WARN）
alter function public.set_updated_at() set search_path = '';
