-- =====================================================================
-- 0009: 時系列データ
--   - sensor_readings: 温湿度等の生データ
--   - gateway_status_events: オンライン/オフライン遷移
-- =====================================================================

create table public.sensor_readings (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations on delete cascade,
  sensor_id uuid not null references public.devices on delete cascade,
  measured_at timestamptz not null,
  temperature numeric,
  humidity numeric,
  battery int,
  source_inbox_id uuid references public.webhook_inbox on delete set null,
  inserted_at timestamptz default now()
);

create index sensor_readings_sensor_time_idx
  on public.sensor_readings (sensor_id, measured_at desc);
create index sensor_readings_org_time_idx
  on public.sensor_readings (organization_id, measured_at desc);

comment on table public.sensor_readings is 'センサーの時系列測定値（温度・湿度・バッテリ等）';

-- ---------------------------------------------------------------------
-- gateway_status_events
-- ---------------------------------------------------------------------
create table public.gateway_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  gateway_id uuid not null references public.devices on delete cascade,
  occurred_at timestamptz default now(),
  status text check (status in ('online','offline')),
  source text
);

create index gateway_status_events_gw_time_idx
  on public.gateway_status_events (gateway_id, occurred_at desc);

comment on table public.gateway_status_events is 'ゲートウェイのオンライン/オフライン遷移ログ';
comment on column public.gateway_status_events.source is 'heartbeat / webhook / manual';
