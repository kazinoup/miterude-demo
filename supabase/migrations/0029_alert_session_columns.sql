-- Phase 1.3a: 連続逸脱アラートのセッション管理用カラム
-- ============================================================
-- 1 つの「連続逸脱期間」を 1 セッション (session_id) として束ね、
-- そのセッション内で発火した回数（初回 = 0、再アラート = 1, 2, ...）を re_alert_index に記録する。
--
-- 設計:
--   - 同一 sensor × metric が連続で危険逸脱 → 同じ session_id
--   - 途中で 1 サンプルでも正常に戻ったら新セッション
--   - 再アラート OFF: 同セッション内は 1 件のみ (re_alert_index = 0)
--   - 再アラート ON: reAlertHours 経過ごとに re_alert_index = 1, 2, ...

alter table public.alert_logs
  add column if not exists session_id uuid;

alter table public.alert_logs
  add column if not exists re_alert_index integer not null default 0;

-- 同一セッションの取得用
create index if not exists alert_logs_session_idx
  on public.alert_logs (session_id);

-- 「このセンサーの最後の発火を探す」用（Edge Function の判定時に多用）
create index if not exists alert_logs_target_kind_metric_idx
  on public.alert_logs (organization_id, target_id, kind, metric, occurred_at desc);
