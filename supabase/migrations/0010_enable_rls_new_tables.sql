-- =====================================================================
-- 0010: RLS を新規テーブルで有効化
-- ポリシーは未設定 → anon / authenticated からは全件不可
-- Edge Function は service_role なので RLS をバイパスして読み書き可能
-- =====================================================================

alter table public.sensor_categories enable row level security;
alter table public.sensor_groups enable row level security;
alter table public.notification_groups enable row level security;
alter table public.devices enable row level security;
alter table public.sensor_props enable row level security;
alter table public.gateway_props enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.gateway_status_events enable row level security;
