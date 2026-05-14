
alter table webhook_inbox
  add column if not exists raw_body text;
