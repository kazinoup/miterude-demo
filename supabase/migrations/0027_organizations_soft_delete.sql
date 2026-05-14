-- =====================================================================
-- 0027: organizations の論理削除（無効化）+ 物理削除猶予期間
--
-- 運用フロー:
--   1. admin が「無効化」操作 → deactivated_at = now(), physical_delete_after = now() + 180d
--   2. 猶予期間中（今〜180日）: 復活可、テナント側からはアクセス不可
--   3. 期間終了後: 完全削除を許可（同じ確認モーダル）
-- =====================================================================

alter table public.organizations
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by_user_id uuid references public.users on delete set null,
  add column if not exists deactivation_reason text,
  add column if not exists physical_delete_after timestamptz;

comment on column public.organizations.deactivated_at is
  '無効化（論理削除）した日時。null = 通常運用中。';
comment on column public.organizations.physical_delete_after is
  'この日時以降、admin が物理削除を実行できる（既定: 無効化から 180 日後）。';
