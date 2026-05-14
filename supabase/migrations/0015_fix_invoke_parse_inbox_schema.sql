-- pg_net の関数は net スキーマ。search_path に含めて呼び出す。
create or replace function public.invoke_parse_inbox(p_limit int default 500)
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare
  request_id bigint;
  url text := 'https://kktwzllydtlsoahvdhzl.supabase.co/functions/v1/parse-inbox';
  anon_jwt text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdHd6bGx5ZHRsc29haHZkaHpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MzYzODIsImV4cCI6MjA5NDAxMjM4Mn0.TXcNZVMDZ-G4W-v4yOPwP5IU5FQLYFkCLEJ9t_YAJcA';
begin
  request_id := net.http_post(
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
