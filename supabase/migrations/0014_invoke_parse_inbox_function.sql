-- =====================================================================
-- 0014: parse-inbox Edge Function を呼び出すヘルパ関数 + pg_cron ジョブ
--
-- 利用イメージ:
--   select public.invoke_parse_inbox();      -- 手動キック
--   pg_cron が 10 分おきに自動実行
--
-- 認証は anon JWT を使う（parse-inbox 内部は service_role で動くため、
-- 入口の verify_jwt を anon でも通せれば十分）。
--
-- ⚠ 注意: URL と anon JWT は環境ごとに異なる。
-- dev / stg / prod それぞれで `public.invoke_parse_inbox` を該当環境の値で再作成する必要がある。
-- =====================================================================

create or replace function public.invoke_parse_inbox(p_limit int default 500)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_id bigint;
  url text := 'https://kktwzllydtlsoahvdhzl.supabase.co/functions/v1/parse-inbox';
  anon_jwt text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdHd6bGx5ZHRsc29haHZkaHpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MzYzODIsImV4cCI6MjA5NDAxMjM4Mn0.TXcNZVMDZ-G4W-v4yOPwP5IU5FQLYFkCLEJ9t_YAJcA';
begin
  request_id := extensions.net.http_post(
    url := url || '?limit=' || p_limit::text,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || anon_jwt,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  return request_id;
end;
$$;

comment on function public.invoke_parse_inbox(int) is
  'parse-inbox Edge Function を非同期で呼び出す。返値は net._http_response テーブルで追跡できる request_id。';

-- pg_cron: 10 分おきに実行
select cron.schedule(
  'parse-inbox-every-10min',  -- ジョブ名
  '*/10 * * * *',             -- crontab 形式
  $$select public.invoke_parse_inbox(500);$$
);
