/**
 * ダッシュボード確認リマインドの編集ダイアログ — Phase G
 *
 * 用途: 毎日 / 毎週、決まった時刻までに DashboardCheckin が無ければ通知する。
 * 配信形式は当面リンク方式（通知本文にダッシュボード閲覧リンクを載せる）。
 */
import { useEffect, useRef, useState } from 'react'
import { X, Trash2, ClipboardCheck, Send } from 'lucide-react'
import type {
  DashboardReminder,
  DashboardReminderFrequency,
  DashboardStore,
  NotificationGroupStore,
} from '../types'
import { NOTIFICATION_TIMING_LABELS } from '../types'

type Props = {
  open: boolean
  initial: DashboardReminder | null
  notificationGroups: NotificationGroupStore
  dashboards: DashboardStore
  onClose: () => void
  onSubmit: (reminder: DashboardReminder) => void
  onDelete?: (id: string) => void
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

function nextReminderId(): string {
  return `dr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function DashboardReminderEditDialog({
  open,
  initial,
  notificationGroups,
  dashboards,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [dashboardId, setDashboardId] = useState<string | null>(null)
  const [frequency, setFrequency] = useState<DashboardReminderFrequency>('daily')
  const [deadlineTime, setDeadlineTime] = useState('11:00')
  const [weeklyDayOfWeek, setWeeklyDayOfWeek] = useState<number>(1)
  const [notificationGroupId, setNotificationGroupId] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setEnabled(initial.enabled)
      setDashboardId(initial.dashboardId)
      setFrequency(initial.frequency)
      setDeadlineTime(initial.deadlineTime)
      setWeeklyDayOfWeek(initial.weeklyDayOfWeek ?? 1)
      setNotificationGroupId(initial.notificationGroupId)
    } else {
      setName('')
      setEnabled(true)
      setDashboardId(null)
      setFrequency('daily')
      setDeadlineTime('11:00')
      setWeeklyDayOfWeek(1)
      setNotificationGroupId(null)
    }
  }, [open, initial])

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      alert('表示名を入力してください。')
      return
    }
    const now = new Date()
    if (initial) {
      onSubmit({
        ...initial,
        name: trimmed,
        enabled,
        dashboardId,
        frequency,
        deadlineTime,
        weeklyDayOfWeek: frequency === 'weekly' ? weeklyDayOfWeek : undefined,
        notificationGroupId,
        updatedAt: now,
      })
    } else {
      onSubmit({
        id: nextReminderId(),
        name: trimmed,
        enabled,
        dashboardId,
        frequency,
        deadlineTime,
        weeklyDayOfWeek: frequency === 'weekly' ? weeklyDayOfWeek : undefined,
        notificationGroupId,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  function handleDelete() {
    if (!initial || !onDelete) return
    if (!confirm(`リマインド「${initial.name}」を削除しますか？`)) return
    onDelete(initial.id)
  }

  return (
    <dialog
      ref={ref}
      className="app-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClose={onClose}
    >
      <form className="app-dialog-form" onSubmit={handleSubmit}>
        <header className="app-dialog-head">
          <h2>
            <ClipboardCheck size={16} className="head-icon" />
            {initial
              ? '確認リマインドを編集'
              : '確認リマインドを作成'}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="閉じる"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        <div className="app-dialog-body">
          <div className="form-row">
            <label className="form-label" htmlFor="dr-name">
              表示名
            </label>
            <input
              id="dr-name"
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 朝礼前の確認リマインド"
              maxLength={100}
              required
            />
          </div>

          <div className="form-row">
            <label className="check-row">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>有効化（OFF にすると通知停止）</span>
            </label>
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="dr-dashboard">
              対象ダッシュボード
            </label>
            <select
              id="dr-dashboard"
              className="select"
              value={dashboardId ?? ''}
              onChange={(e) => setDashboardId(e.target.value || null)}
            >
              <option value="">全ダッシュボード</option>
              {Object.values(dashboards)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-row">
            <span className="form-label">確認頻度</span>
            <div className="seg-toggle">
              <button
                type="button"
                className={`seg-toggle-btn ${frequency === 'daily' ? 'is-active' : ''}`}
                onClick={() => setFrequency('daily')}
              >
                毎日
              </button>
              <button
                type="button"
                className={`seg-toggle-btn ${frequency === 'weekly' ? 'is-active' : ''}`}
                onClick={() => setFrequency('weekly')}
              >
                週次
              </button>
            </div>
          </div>

          <div className="form-row">
            <span className="form-label">確認締切時刻</span>
            <div className="schedule-time-row">
              {frequency === 'weekly' && (
                <label className="inline-field">
                  <span>毎週</span>
                  <select
                    className="select"
                    value={weeklyDayOfWeek}
                    onChange={(e) => setWeeklyDayOfWeek(Number(e.target.value))}
                  >
                    {WEEKDAYS.map((wd, i) => (
                      <option key={i} value={i}>
                        {wd}曜日
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="inline-field">
                <span>{frequency === 'weekly' ? 'の' : '毎日'}</span>
                <input
                  type="time"
                  className="select"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  step={60}
                  required
                />
                <span>までに未確認なら通知</span>
              </label>
            </div>
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="dr-group">
              配信先（通知グループ）
              <Send size={11} className="inline-icon-muted" />
            </label>
            <select
              id="dr-group"
              className="select"
              value={notificationGroupId ?? ''}
              onChange={(e) => setNotificationGroupId(e.target.value || null)}
            >
              <option value="">未設定（配信されません）</option>
              {Object.values(notificationGroups)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}（{NOTIFICATION_TIMING_LABELS[g.timing]}・{g.channels.length} 件）
                  </option>
                ))}
            </select>
          </div>
        </div>

        <footer className="app-dialog-foot">
          {initial && onDelete && (
            <button
              type="button"
              className="btn btn-ghost bulk-danger"
              onClick={handleDelete}
            >
              <Trash2 size={14} />
              <span>削除</span>
            </button>
          )}
          <div className="app-dialog-foot-spacer" />
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-primary">
            保存
          </button>
        </footer>
      </form>
    </dialog>
  )
}
