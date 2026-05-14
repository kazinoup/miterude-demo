-- =====================================================================
-- 0024: Admin Console 用に anon 全権限を解禁
--
-- 背景:
--   既存の demo_* ポリシーは demo_org_id() に紐付くため、admin が
--   新規テナントを作成 / 別テナントのデータを参照することができない。
--
-- 方針:
--   テーブルに `admin_full` という FOR ALL ポリシーを追加して anon に
--   全権限（SELECT / INSERT / UPDATE / DELETE）を与える。
--
-- TODO (Phase H 以降): Supabase Auth + JWT claim で super_admin ロールを
--   実装したら admin_full は drop し、JWT ベースのポリシーに置き換える。
-- =====================================================================

do $$
declare
  t text;
  tables text[] := array[
    'organizations',
    'manufacturer_integrations',
    'sensor_categories',
    'sensor_groups',
    'notification_groups',
    'devices',
    'sensor_props',
    'gateway_props',
    'sensor_readings',
    'gateway_status_events',
    'dashboards',
    'sensor_notes',
    'alert_logs',
    'dashboard_checkins'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists admin_full on public.%I', t);
    execute format(
      'create policy admin_full on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end$$;
