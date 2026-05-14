-- =====================================================================
-- 0019: Block F（設定 3 ストアの CRUD）支援
--   1. notification_groups にアプリ型に合わせて description / channels を追加
--   2. 設定 3 テーブル (sensor_categories / sensor_groups / notification_groups)
--      に対し anon の INSERT / UPDATE / DELETE を開放（デモ組織限定）
-- =====================================================================

alter table public.notification_groups
  add column if not exists description text,
  add column if not exists channels jsonb default '[]'::jsonb;

-- ---- INSERT / UPDATE / DELETE policy をまとめて適用 ----
do $$
declare
  t text;
  tables text[] := array['sensor_categories', 'sensor_groups', 'notification_groups'];
begin
  foreach t in array tables loop
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
  end loop;
end$$;
