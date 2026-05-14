-- Admin Console から書き込む組織のメタを保持するためのカラム追加。
alter table public.organizations
  add column if not exists billing_cycle text check (billing_cycle in ('monthly','annual')),
  add column if not exists contract_started_at timestamptz,
  add column if not exists contract_expires_at timestamptz,
  add column if not exists payment_method text check (payment_method in ('bank_transfer','credit_card')),
  add column if not exists billing_email text,
  add column if not exists auto_invoice boolean,
  add column if not exists contract_type text check (contract_type in ('demo','subscription','purchase','typeless')),
  add column if not exists tsukurude_ai_enabled boolean;

-- manufacturer_integrations のための一意制約（seed の onConflict 用）
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manufacturer_integrations_org_manufacturer_uniq'
  ) then
    alter table public.manufacturer_integrations
      add constraint manufacturer_integrations_org_manufacturer_uniq
      unique (organization_id, manufacturer);
  end if;
end$$;
