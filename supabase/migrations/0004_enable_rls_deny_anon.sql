
-- RLS を有効化（ポリシーは付けない = anon からは何もできない）
-- service_role は RLS をバイパスするので、Edge Function はそのまま動く。
-- 認証統合後（Phase F-4）にユーザー向けの SELECT ポリシーを追加する。

alter table organizations enable row level security;
alter table manufacturer_integrations enable row level security;
alter table webhook_inbox enable row level security;

-- 念のため Force RLS（テーブル所有者でも RLS が効くようにする）
-- service_role は SUPERUSER 相当ではないが BYPASSRLS 権限を持つので
-- そのまま通過する。
-- 参考: https://supabase.com/docs/guides/database/postgres/row-level-security#bypassrls
