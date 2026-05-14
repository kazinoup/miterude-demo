-- =====================================================================
-- 0018: devices の DELETE をデモ組織内で anon に開放
--
-- センサー削除時、cascade で sensor_props / sensor_readings も連鎖削除される。
-- ただし Webhook が同じ devEUI で続けて受信すると webhook-milesight が再登録する仕様。
-- =====================================================================

drop policy if exists demo_delete on public.devices;
create policy demo_delete on public.devices
  for delete to anon, authenticated
  using (organization_id = public.demo_org_id());
