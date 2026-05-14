-- =====================================================================
-- 0021: dashboards テーブル（Block G）
--
-- アプリ側の Dashboard 型は widgets を配列で持っているため、別テーブルに切らず
-- jsonb で同一行に格納する。検索は不要（id で引くだけ）。
-- =====================================================================

create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,

  name text not null,
  description text,
  target_sensor_ids uuid[] default '{}',
  default_period jsonb not null default '{"type":"week"}'::jsonb,
  widgets jsonb not null default '[]'::jsonb,
  public_share_token text,
  public_share_issued_at timestamptz,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index dashboards_org_idx on public.dashboards (organization_id, display_order);
create unique index dashboards_share_token_uniq on public.dashboards (public_share_token)
  where public_share_token is not null;

comment on table public.dashboards is 'ダッシュボード（ウィジェットは widgets jsonb に内包）';

-- RLS と policies
alter table public.dashboards enable row level security;

drop policy if exists demo_select on public.dashboards;
create policy demo_select on public.dashboards
  for select to anon, authenticated
  using (organization_id = public.demo_org_id());

drop policy if exists demo_insert on public.dashboards;
create policy demo_insert on public.dashboards
  for insert to anon, authenticated
  with check (organization_id = public.demo_org_id());

drop policy if exists demo_update on public.dashboards;
create policy demo_update on public.dashboards
  for update to anon, authenticated
  using (organization_id = public.demo_org_id())
  with check (organization_id = public.demo_org_id());

drop policy if exists demo_delete on public.dashboards;
create policy demo_delete on public.dashboards
  for delete to anon, authenticated
  using (organization_id = public.demo_org_id());

-- Realtime 配信対象に追加
alter publication supabase_realtime add table public.dashboards;
