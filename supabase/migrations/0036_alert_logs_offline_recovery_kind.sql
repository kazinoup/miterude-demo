-- Phase 1.11b: オフライン復帰アラート用に kind = 'offline-recovery' を追加。
-- offline 系の通知は次の 4 ケースを取り得る:
--   - kind='offline': 初回検知 / 継続中の再アラート（session_id で識別）
--   - kind='offline-recovery': 通信途絶から戻ったときの単発通知
-- バッテリーは初回検知時に 'battery'、継続中の再アラートも 'battery'（session_id で連結）。

alter table public.alert_logs drop constraint if exists alert_logs_kind_check;
alter table public.alert_logs
  add constraint alert_logs_kind_check
  check (kind in ('deviation-alert', 'deviation-warn', 'offline', 'offline-recovery', 'battery'));
