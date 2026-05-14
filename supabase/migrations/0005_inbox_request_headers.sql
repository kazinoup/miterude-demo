
-- 受信した HTTP ヘッダを保存する列（Milesight の署名スキーム調査用）
alter table webhook_inbox
  add column if not exists request_headers jsonb;

-- MDP 側の本物の secret / UUID を保存
update manufacturer_integrations
  set webhook_secret = 'g6Z3Sstwal1xvoQMqLpYcHsRN0R94brD',
      webhook_uuid   = '665e05dd-2f56-4c11-ac17-a77d74d747cf',
      updated_at     = now()
  where organization_id = '00000000-0000-0000-0000-00000000d001'
    and manufacturer    = 'Milesight';
