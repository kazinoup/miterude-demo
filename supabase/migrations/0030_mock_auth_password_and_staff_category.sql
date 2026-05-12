-- Phase 1.5a: モック認証用 password_hash + staff_category 'system_admin' 追加
-- ============================================================
-- Clerk 統合までの中継期間用。Clerk 移行時に password_hash カラムは drop する。
--
-- - users.password_hash: SHA-256 (hex 64文字) を格納。モック前提なので salt なし。
-- - staff_category: 'system_admin' を追加（既存 'support' / 'sales' に加えて）
-- - super_admin ユーザーは staff_category='system_admin' にバックフィル
-- - 内部スタッフ全員（super_admin + support + sales）に共有パスワード "Canbright0987" を仕込む
--
-- ログイン区分:
--  - staff_category='system_admin' (system_role='super_admin'): Admin Console フルアクセス
--  - staff_category='support'/'sales' (system_role='support'): Admin Console 限定アクセス（割当テナント）
--  - system_role=null: 顧客ユーザー、パスワード何でも OK

-- 1) password_hash カラム追加
alter table public.users
  add column if not exists password_hash text;

comment on column public.users.password_hash is
  'モック認証用: SHA-256(hex) of password. Clerk 統合時に drop 予定。';

-- 2) staff_category 制約を 'system_admin' を含めて張り直し
alter table public.users
  drop constraint if exists users_staff_category_check;

alter table public.users
  add constraint users_staff_category_check
  check (staff_category in ('system_admin', 'support', 'sales'));

-- 3) super_admin に staff_category='system_admin' をバックフィル
update public.users
   set staff_category = 'system_admin'
 where system_role = 'super_admin'
   and (staff_category is null or staff_category <> 'system_admin');

-- 4) 内部スタッフ全員（super_admin + support）に共有パスワード Canbright0987 を設定
update public.users
   set password_hash = encode(sha256('Canbright0987'::bytea), 'hex')
 where system_role is not null;
