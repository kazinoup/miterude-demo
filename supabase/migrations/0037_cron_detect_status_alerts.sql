-- Phase 1.11b: detect-status-alerts を 10 分おきに起動。
-- オフライン検知のしきい値は最小 1 時間なので、10 分粒度で十分（過剰検知も発生しにくい）。

do $$
begin
  if exists (select 1 from cron.job where jobname = 'detect-status-alerts-every-10min') then
    perform cron.unschedule('detect-status-alerts-every-10min');
  end if;
end$$;

select cron.schedule(
  'detect-status-alerts-every-10min',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kktwzllydtlsoahvdhzl.supabase.co/functions/v1/detect-status-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdHd6bGx5ZHRsc29haHZkaHpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MzYzODIsImV4cCI6MjA5NDAxMjM4Mn0.TXcNZVMDZ-G4W-v4yOPwP5IU5FQLYFkCLEJ9t_YAJcA'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
  $cron$
);
