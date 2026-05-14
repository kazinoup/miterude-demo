-- =====================================================================
-- 0026: Admin 用テーブル群
--   users / organization_members / staff_assignments / staff_audit_logs
--
-- Phase A の認証は Clerk 統合予定だが、当面はモック。clerk_user_id は
-- 後で紐付ける想定で nullable に。
-- =====================================================================

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique,
  email text not null unique,
  display_name text not null,
  -- 運営側ロール。null = 顧客
  system_role text check (system_role in ('super_admin','support')),
  -- support のときの細分化
  staff_category text check (staff_category in ('support','sales')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index users_system_role_idx on public.users (system_role) where system_role is not null;

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references public.users on delete cascade,
  role text not null check (role in ('editor','dashboard_confirmer')),
  invited_at timestamptz not null default now(),
  first_login_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);
create index organization_members_org_idx on public.organization_members (organization_id);

create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.users on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  granted_by_user_id uuid references public.users on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
create index staff_assignments_staff_idx on public.staff_assignments (staff_user_id);
create index staff_assignments_org_idx on public.staff_assignments (organization_id);

create table public.staff_audit_logs (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid references public.users on delete set null,
  organization_id uuid references public.organizations on delete set null,
  action text not null,
  target_table text,
  target_id text,
  metadata jsonb default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index staff_audit_logs_occurred_idx on public.staff_audit_logs (occurred_at desc);
create index staff_audit_logs_staff_idx on public.staff_audit_logs (staff_user_id, occurred_at desc);
create index staff_audit_logs_org_idx on public.staff_audit_logs (organization_id, occurred_at desc);

-- RLS と admin_full ポリシー
do $$
declare
  t text;
  tables text[] := array['users','organization_members','staff_assignments','staff_audit_logs'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_full on public.%I', t);
    execute format(
      'create policy admin_full on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end$$;
