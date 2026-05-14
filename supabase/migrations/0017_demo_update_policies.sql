-- =====================================================================
-- 0017: デモ組織への UPDATE を anon に開放（Phase G Block D の書き戻し用）
--
-- 本番では JWT ベース＋ロール権限で制限する予定。
-- 当面はデモなので、SELECT と同じく demo_org_id() で絞り込んで開放する。
-- INSERT / DELETE は依然 service_role のみ（センサー登録は Webhook 経由）。
-- =====================================================================

-- devices: 直接 organization_id で判定可
drop policy if exists demo_update on public.devices;
create policy demo_update on public.devices
  for update to anon, authenticated
  using (organization_id = public.demo_org_id())
  with check (organization_id = public.demo_org_id());

-- sensor_props: devices 経由で判定
drop policy if exists demo_update on public.sensor_props;
create policy demo_update on public.sensor_props
  for update to anon, authenticated
  using (
    device_id in (
      select id from public.devices where organization_id = public.demo_org_id()
    )
  )
  with check (
    device_id in (
      select id from public.devices where organization_id = public.demo_org_id()
    )
  );
