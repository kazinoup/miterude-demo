
-- デモテナント 1 つを seed
-- ID は固定にしてアプリのモックと整合させる
insert into organizations (id, name, slug, plan)
values (
  '00000000-0000-0000-0000-00000000d001'::uuid,
  'CanBright（デモ組織）',
  'demo-canbright',
  'demo'
)
on conflict (slug) do nothing;

-- Milesight 連携の枠を作る。webhook_secret は後で更新する想定
insert into manufacturer_integrations (
  organization_id, manufacturer, enabled, webhook_secret, sensor_kinds, config
)
values (
  '00000000-0000-0000-0000-00000000d001'::uuid,
  'Milesight',
  true,
  'demo-secret-rotate-me-' || encode(gen_random_bytes(16), 'hex'),
  array['temperature-humidity'],
  '{}'::jsonb
)
on conflict (organization_id, manufacturer) do nothing;
