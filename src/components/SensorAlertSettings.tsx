import { Bell, Send } from 'lucide-react'
import type { AlertSettings, NotificationGroupStore } from '../types'
import { NOTIFICATION_TIMING_LABELS } from '../types'

type Props = {
  sensorId: string
  value: AlertSettings
  onChange: (next: AlertSettings) => void
  notificationGroups: NotificationGroupStore
  notificationGroupId: string | null
  onNotificationGroupChange: (id: string | null) => void
}

const OFFLINE_PRESETS: { label: string; minutes: number }[] = [
  { label: '30 分', minutes: 30 },
  { label: '1 時間', minutes: 60 },
  { label: '6 時間', minutes: 360 },
  { label: '24 時間', minutes: 1440 },
]

/**
 * センサーごとのアラート設定 — Phase 9.12 でリアルタイム保存に統一。
 *
 * 順序:
 * 1. 通知グループ（送信先・送信タイミング）
 * 2. オフライン通知
 * 3. 連続逸脱通知
 */
export function SensorAlertSettings({
  sensorId: _sensorId,
  value,
  onChange,
  notificationGroups,
  notificationGroupId,
  onNotificationGroupChange,
}: Props) {
  function update<K extends keyof AlertSettings>(key: K, val: AlertSettings[K]) {
    onChange({ ...value, [key]: val })
  }

  return (
    <section className="panel-card alert-card">
      <div className="panel-card-head">
        <h2>
          <Bell size={16} className="head-icon" />
          アラート設定
        </h2>
        <span className="panel-card-meta muted">
          変更は自動保存されます
        </span>
      </div>

      <div className="alert-form">
        <fieldset className="alert-fieldset">
          <legend>通知グループ</legend>
          <div className="alert-row">
            <Send size={13} className="row-leading-icon" />
            <span className="row-label">通知の送信先・送信タイミング</span>
            <select
              className="select"
              value={notificationGroupId ?? ''}
              onChange={(e) => onNotificationGroupChange(e.target.value || null)}
            >
              <option value="">設定なし（通知しない）</option>
              {Object.values(notificationGroups)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}（{NOTIFICATION_TIMING_LABELS[g.timing]}・{g.channels.length} 件）
                  </option>
                ))}
            </select>
          </div>
          {notificationGroupId == null && (
            <p className="muted in-panel" style={{ marginTop: '0.4rem' }}>
              「設定」→「通知グループ」で送信先と送信タイミングを定義し、ここから選択できます。
            </p>
          )}
        </fieldset>

        <fieldset className="alert-fieldset">
          <legend>オフライン通知</legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={value.offlineEnabled}
              onChange={(e) => update('offlineEnabled', e.target.checked)}
            />
            <span>センサーからの受信が途絶えたら通知する</span>
          </label>
          <div className="alert-row">
            <span className="row-label">判定までの時間</span>
            <div className="chip-group">
              {OFFLINE_PRESETS.map((p) => (
                <button
                  key={p.minutes}
                  type="button"
                  disabled={!value.offlineEnabled}
                  className={`chip-toggle ${
                    value.offlineThresholdMinutes === p.minutes ? 'is-active' : ''
                  }`}
                  onClick={() => update('offlineThresholdMinutes', p.minutes)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="alert-fieldset">
          <legend>連続逸脱通知</legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={value.deviationEnabled}
              onChange={(e) => update('deviationEnabled', e.target.checked)}
            />
            <span>連続して閾値を超えたら通知する</span>
          </label>
          <div className="alert-row">
            <span className="row-label">何回連続で通知するか</span>
            <div className="num-input-row">
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                disabled={!value.deviationEnabled}
                value={value.deviationConsecutiveCount}
                onChange={(e) =>
                  update(
                    'deviationConsecutiveCount',
                    Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                  )
                }
              />
              <span className="num-input-suffix">回</span>
            </div>
          </div>
        </fieldset>

      </div>
    </section>
  )
}
