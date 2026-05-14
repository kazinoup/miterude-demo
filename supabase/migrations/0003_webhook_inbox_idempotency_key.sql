
-- 部分インデックスは PostgREST upsert で onConflict が扱えないため、
-- 「常に存在する idempotency_key」を導入してフル UNIQUE 制約にする。
-- event_id があればそれを使い、無ければ Edge Function 側で hash を埋める。

-- 1) 旧 partial index を削除
drop index if exists webhook_inbox_org_event_id_unique;

-- 2) idempotency_key 列を追加（NOT NULL は後段で）
alter table webhook_inbox
  add column if not exists idempotency_key text;

-- 3) 既存行に値を埋める（event_id があればそれを使う、無ければ id を流用）
update webhook_inbox
  set idempotency_key = coalesce(event_id, id::text)
  where idempotency_key is null;

-- 4) NOT NULL を強制
alter table webhook_inbox
  alter column idempotency_key set not null;

-- 5) フル UNIQUE 制約
alter table webhook_inbox
  drop constraint if exists webhook_inbox_org_idem_unique;
alter table webhook_inbox
  add constraint webhook_inbox_org_idem_unique
  unique (organization_id, idempotency_key);
