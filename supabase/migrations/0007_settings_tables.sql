
-- ユーザー定義区分（運用カテゴリ。冷凍/冷蔵/室温/親機/中継機）
create table if not exists sensor_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  icon text,
  description text,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, name)
);
create index if not exists sensor_categories_org_idx on sensor_categories (organization_id);

-- 物理グループ（フロア / 設置場所）
create table if not exists sensor_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  description text,
  color text,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, name)
);
create index if not exists sensor_groups_org_idx on sensor_groups (organization_id);

-- 通知グループ
create table if not exists notification_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  -- 即時 / 1 時間まとめ / 6 時間 / 12 時間 / 24 時間まとめ
  timing text not null default 'instant'
    check (timing in ('instant','batch-1h','batch-6h','batch-12h','batch-1d')),
  -- channel 設計は将来 notification_channels に分離。当面は最小カラムだけ。
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, name)
);
create index if not exists notification_groups_org_idx on notification_groups (organization_id);
