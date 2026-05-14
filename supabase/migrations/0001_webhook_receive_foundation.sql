
-- Phase F-1 最小スキーマ: Webhook 受信ができるところまで
-- organizations / manufacturer_integrations / webhook_inbox の 3 テーブル

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text default 'demo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists manufacturer_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  manufacturer text not null,
  enabled boolean default false,
  webhook_secret text,
  webhook_uuid text,
  sensor_kinds text[] default '{}',
  config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, manufacturer)
);

create table if not exists webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations on delete cascade,
  manufacturer text not null,
  received_at timestamptz default now(),
  source_ip inet,
  signature_valid boolean,
  payload_raw jsonb not null,
  -- Milesight の eventId を冪等性キーとして使う
  event_id text,
  parse_status text default 'pending' check (parse_status in (
    'pending','parsed','failed','ignored','unmatched'
  )),
  parse_error text,
  parsed_at timestamptz,
  parsed_reading_count int,
  created_at timestamptz default now()
);

-- 冪等性: (organization_id, event_id) で重複排除（event_id が null の場合は重複チェックなし）
create unique index if not exists webhook_inbox_org_event_id_unique
  on webhook_inbox (organization_id, event_id)
  where event_id is not null;

create index if not exists webhook_inbox_received_at_idx
  on webhook_inbox (received_at desc);

create index if not exists webhook_inbox_pending_idx
  on webhook_inbox (parse_status, received_at)
  where parse_status = 'pending';

-- RLS は後で有効化（今は service_role のみ書き込むので一旦 OFF）
