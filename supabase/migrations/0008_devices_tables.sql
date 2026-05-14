-- =====================================================================
-- 0008: devices マスター + sensor_props / gateway_props
-- Class Table Inheritance パターン
-- =====================================================================

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,

  -- 外部識別（メーカーが決める、不変）
  device_type text not null check (device_type in ('sensor','gateway')),
  role text not null,
  manufacturer text not null,
  model text not null,
  external_key text not null,
  serial_number text not null,
  dev_eui text,

  -- 表示・分類（ユーザ運用上設定）
  name text,
  device_number text not null,
  category_id uuid references public.sensor_categories on delete set null,
  group_id uuid references public.sensor_groups on delete set null,
  tags text[] default '{}',
  notification_group_id uuid references public.notification_groups on delete set null,

  -- システム管理
  online boolean default false,
  last_seen_at timestamptz,
  registered_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (organization_id, manufacturer, external_key)
);

create index devices_org_idx on public.devices (organization_id);
create index devices_device_type_idx on public.devices (device_type);
create index devices_lookup_idx on public.devices (organization_id, manufacturer, external_key);

comment on table public.devices is 'デバイス（センサー/ゲートウェイ/中継機）の共通マスター';
comment on column public.devices.device_type is 'sensor / gateway';
comment on column public.devices.role is 'sensor: temperature-humidity / temperature / current / co2 / pressure / door / other  |  gateway: master / relay';
comment on column public.devices.external_key is 'メーカー発行の一意キー（Milesight: devEUI、その他: serial 等）';

-- ---------------------------------------------------------------------
-- sensor_props
-- ---------------------------------------------------------------------
create table public.sensor_props (
  device_id uuid primary key references public.devices on delete cascade,
  gateway_id uuid references public.devices on delete set null,
  thresholds jsonb,
  battery int check (battery between 0 and 100),
  alert_settings jsonb not null default '{
    "offlineEnabled": true,
    "offlineThresholdMinutes": 60,
    "deviationEnabled": true,
    "deviationConsecutiveCount": 3,
    "batteryEnabled": false,
    "batteryThresholdPercent": 10,
    "notifyChannels": {"email": true, "slack": false, "push": false}
  }'::jsonb,
  exclusion_windows jsonb default '[]'::jsonb,
  exclusion_dates jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index sensor_props_gateway_idx on public.sensor_props (gateway_id);

comment on table public.sensor_props is 'センサー固有プロパティ（device_type=sensor の延長テーブル）';

-- ---------------------------------------------------------------------
-- gateway_props
-- ---------------------------------------------------------------------
create table public.gateway_props (
  device_id uuid primary key references public.devices on delete cascade,
  alert_settings jsonb not null default '{
    "offlineEnabled": true,
    "offlineThresholdMinutes": 60,
    "notifyChannels": {"email": true, "slack": false, "push": false}
  }'::jsonb,
  exclusion_windows jsonb default '[]'::jsonb,
  exclusion_dates jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.gateway_props is 'ゲートウェイ固有プロパティ（device_type=gateway の延長テーブル）';