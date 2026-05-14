-- =====================================================================
-- 0016: Realtime publication にテーブル群を追加
--
-- supabase_realtime publication は Supabase が用意するデフォルト。
-- ここに ADD TABLE すると、対象テーブルの行イベント（INSERT/UPDATE/DELETE）が
-- Realtime チャネル経由でクライアントに配信される。
--
-- 配信内容のフィルタは anon の RLS ポリシー（0012）で制限される:
-- デモ組織以外のテナント行は配信されない。
-- =====================================================================

alter publication supabase_realtime add table public.sensor_readings;
alter publication supabase_realtime add table public.devices;
alter publication supabase_realtime add table public.sensor_props;
