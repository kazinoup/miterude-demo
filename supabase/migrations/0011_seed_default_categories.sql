-- =====================================================================
-- 0011: デモ組織のデフォルト区分を seed
--
-- Phase F-4 改訂後の現行仕様に合わせて、区分は「冷凍 / 冷蔵 / 室温」の 3 つだけ。
-- 「親機 / 中継機」は SensorCategory ではなく devices.role ('master'/'relay') に
-- 移行済み（src/lib/categories.ts: LEGACY_GATEWAY_CATEGORY_IDS）。
--
-- アプリ側の固定 ID と一致させるため、display_order と name を揃える。
-- =====================================================================

insert into public.sensor_categories
  (organization_id, name, icon, description, display_order)
values
  ('00000000-0000-0000-0000-00000000d001', '冷凍',
   'snowflake', '冷凍庫・フリーザー（標準セット）', 1),
  ('00000000-0000-0000-0000-00000000d001', '冷蔵',
   'refrigerator', '冷蔵庫・チルド（標準セット）', 2),
  ('00000000-0000-0000-0000-00000000d001', '室温',
   'home', '室温・常温保管（標準セット）', 3)
on conflict (organization_id, name) do nothing;
