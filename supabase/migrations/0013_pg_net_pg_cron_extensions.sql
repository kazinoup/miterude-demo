-- =====================================================================
-- 0013: pg_net + pg_cron 拡張を有効化
--
-- pg_net: HTTP 非同期呼び出し（Edge Function へ）
-- pg_cron: 定期スケジューラ
-- どちらも Supabase 標準で利用可能
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
