-- =====================================================================
-- 0022: Block H 用テーブル
--   sensor_notes / alert_logs / dashboard_checkins
--
-- いずれも単純な行（ネストは JSONB に畳む）。Realtime publication にも追加。
-- 当面はデモ組織で anon の SELECT/INSERT/UPDATE/DELETE を開放。
-- =====================================================================

-- ---------- sensor_notes ----------
create table public.sensor_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  sensor_id uuid references public.devices on delete set null,
  sensor_name_snapshot text not null,
  author_id text not null,
  author_name text not null,
  body text not null,
  category text not null check (category in (
    'install','move','calibration','maintenance','config','incident','other'
  )),
  -- 承認情報（あれば）
  approval jsonb,
  timestamp timestamptz not null default now(),
  created_at timestamptz default now()
);
create index sensor_notes_org_time_idx on public.sensor_notes (organization_id, timestamp desc);
create index sensor_notes_sensor_idx on public.sensor_notes (sensor_id, timestamp desc);

-- ---------- alert_logs ----------
create table public.alert_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  occurred_at timestamptz not null,
  target_kind text not null check (target_kind in ('sensor','gateway')),
  target_id uuid references public.devices on delete set null,
  manufacturer text not null,
  model text not null,
  serial_number text not null,
  sensor_number text,
  kind text not null check (kind in ('deviation-alert','deviation-warn','offline','battery')),
  metric text check (metric in ('temperature','humidity','battery')),
  value numeric,
  message text not null,
  confirm_comment text,
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz default now()
);
create index alert_logs_org_time_idx on public.alert_logs (organization_id, occurred_at desc);
create index alert_logs_target_idx on public.alert_logs (target_id, occurred_at desc);

-- ---------- dashboard_checkins ----------
create table public.dashboard_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  dashboard_id uuid references public.dashboards on delete set null,
  dashboard_name_snapshot text not null,
  user_id text not null,
  user_name text not null,
  timestamp timestamptz not null default now(),
  status text check (status in ('no-issue','has-issue')),
  comment text,
  sensor_comments jsonb default '[]'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  approval jsonb,
  created_at timestamptz default now()
);
create index dashboard_checkins_org_time_idx
  on public.dashboard_checkins (organization_id, timestamp desc);
create index dashboard_checkins_dashboard_idx
  on public.dashboard_checkins (dashboard_id, timestamp desc);

-- ---------- RLS + policies ----------
do $$
declare t text;
declare tables text[] := array['sensor_notes','alert_logs','dashboard_checkins'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists demo_select on public.%I', t);
    execute format(
      'create policy demo_select on public.%I for select to anon, authenticated using (organization_id = public.demo_org_id())',
      t
    );
    execute format('drop policy if exists demo_insert on public.%I', t);
    execute format(
      'create policy demo_insert on public.%I for insert to anon, authenticated with check (organization_id = public.demo_org_id())',
      t
    );
    execute format('drop policy if exists demo_update on public.%I', t);
    execute format(
      'create policy demo_update on public.%I for update to anon, authenticated using (organization_id = public.demo_org_id()) with check (organization_id = public.demo_org_id())',
      t
    );
    execute format('drop policy if exists demo_delete on public.%I', t);
    execute format(
      'create policy demo_delete on public.%I for delete to anon, authenticated using (organization_id = public.demo_org_id())',
      t
    );
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end$$;
