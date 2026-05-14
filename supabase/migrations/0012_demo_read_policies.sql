-- =====================================================================
-- 0012: デモ組織の SELECT を anon に開放
--
-- sensor_props / gateway_props は organization_id を持たないため、
-- devices テーブル経由で判定する。
-- =====================================================================

create or replace function public.demo_org_id() returns uuid
language sql immutable
as $$ select '00000000-0000-0000-0000-00000000d001'::uuid $$;

-- organization_id を直接持つテーブル
do $$
declare
  t text;
  tables text[] := array[
    'devices',
    'sensor_readings',
    'gateway_status_events',
    'sensor_categories',
    'sensor_groups',
    'notification_groups'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists demo_select on public.%I', t);
    execute format(
      'create policy demo_select on public.%I for select to anon, authenticated using (organization_id = public.demo_org_id())',
      t
    );
  end loop;
end$$;

-- organizations: 自分を表す行のみ
drop policy if exists demo_select on public.organizations;
create policy demo_select on public.organizations
  for select to anon, authenticated
  using (id = public.demo_org_id());

-- sensor_props / gateway_props: devices 経由
drop policy if exists demo_select on public.sensor_props;
create policy demo_select on public.sensor_props
  for select to anon, authenticated
  using (
    device_id in (
      select id from public.devices where organization_id = public.demo_org_id()
    )
  );

drop policy if exists demo_select on public.gateway_props;
create policy demo_select on public.gateway_props
  for select to anon, authenticated
  using (
    device_id in (
      select id from public.devices where organization_id = public.demo_org_id()
    )
  );
