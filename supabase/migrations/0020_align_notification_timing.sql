-- app の NotificationTiming は immediate/batch-1h/batch-6h/batch-12h/batch-24h
-- DB 側を合わせる（既存行は 0 件なので影響なし）
alter table public.notification_groups
  drop constraint if exists notification_groups_timing_check;

alter table public.notification_groups
  add constraint notification_groups_timing_check
  check (timing in ('immediate','batch-1h','batch-6h','batch-12h','batch-24h'));

alter table public.notification_groups
  alter column timing set default 'immediate';
