-- gateway_props は SELECT のみ開放されていた。Block I のゲートウェイ編集に向け UPDATE も開放。
drop policy if exists demo_update on public.gateway_props;
create policy demo_update on public.gateway_props
  for update to anon, authenticated
  using (
    device_id in (select id from public.devices where organization_id = public.demo_org_id())
  )
  with check (
    device_id in (select id from public.devices where organization_id = public.demo_org_id())
  );
