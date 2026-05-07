/**
 * センサー個別の逸脱判定（閾値）設定 — Phase 9.12
 *
 * 設計のポイント:
 * - 危険レベルと注意レベルはそれぞれ独立に有効化できる（チェックボックス）
 *   - 「注意のみ」「危険のみ」「両方」「どちらもなし」のすべてを表現可能
 * - 各レベルの「下限」「上限」もそれぞれ独立に設定可能
 *   - 下限のみ → 「N℃ 以下なら NG」
 *   - 上限のみ → 「N℃ 以上なら NG」
 *   - 両方     → 範囲外で NG
 * - 入力変更ごとにリアルタイム保存（保存ボタンなし）
 *   - 上位（SensorDetailView）が onChange を受け取り、即 sensor.thresholds を更新する
 */
import {
  AlertOctagon,
  AlertTriangle,
  Droplets,
  Sliders,
  Thermometer,
  Trash2,
} from 'lucide-react'
import type {
  Sensor,
  TempHumidityThresholds,
  ThresholdLevel,
  ThresholdMetric,
} from '../types'

type Props = {
  sensor: Sensor
  /** 閾値が変わるたびに呼ばれる（リアルタイム保存）。
   *  全てのレベルが空ならば undefined を渡す。 */
  onChange: (next: TempHumidityThresholds | undefined) => void
}

const DEFAULT_LEVEL_OFF: ThresholdLevel = { enabled: false }

function defaultMetric(): ThresholdMetric {
  return {
    alert: { ...DEFAULT_LEVEL_OFF },
    warn: { ...DEFAULT_LEVEL_OFF },
  }
}

/** ThresholdMetric に「ユーザの編集意図」（チェック ON）が残っているか。
 *  min/max が空でも、チェック ON なら保存し続ける。
 *  実際の逸脱判定は lib/report.ts の isLevelActive（enabled かつ min/max
 *  どちらかが設定済み）で行うので、enabled だけの状態は「設定中だが
 *  まだ値が入っていない」中間状態として正しく扱われる。 */
function hasUserIntent(m: ThresholdMetric): boolean {
  return m.alert.enabled || m.warn.enabled
}

/** 上位に渡す TempHumidityThresholds を組み立てる。
 *  両指標ともユーザの編集意図がない（どのチェックも OFF）なら undefined を返す。 */
function buildPayload(
  temp: ThresholdMetric,
  hum: ThresholdMetric,
): TempHumidityThresholds | undefined {
  if (!hasUserIntent(temp) && !hasUserIntent(hum)) return undefined
  return { kind: 'temperature-humidity', temperature: temp, humidity: hum }
}

/** 数値文字列を number に変換（空欄なら undefined） */
function parseNumOrUndef(v: string): number | undefined {
  const t = v.trim()
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

export function SensorThresholdSettings({ sensor, onChange }: Props) {
  const isTempHumidity =
    sensor.kind === 'temperature-humidity' || sensor.kind === undefined

  if (!isTempHumidity) {
    return (
      <div className="threshold-settings threshold-settings-unsupported">
        <Sliders size={14} className="head-icon" />
        <span className="muted">
          このセンサー種別 (<code>{sensor.kind}</code>) の閾値設定はまだ未対応です。
        </span>
      </div>
    )
  }

  // 既存の温湿度閾値を引き出す。無ければ既定値（オフ）
  const existing: TempHumidityThresholds | null =
    sensor.thresholds?.kind === 'temperature-humidity'
      ? sensor.thresholds
      : null
  const temp = existing?.temperature ?? defaultMetric()
  const hum = existing?.humidity ?? defaultMetric()

  function patchTemperature(next: ThresholdMetric) {
    onChange(buildPayload(next, hum))
  }
  function patchHumidity(next: ThresholdMetric) {
    onChange(buildPayload(temp, next))
  }

  function clearAll() {
    onChange(undefined)
  }

  return (
    <div className="threshold-settings">
      <ThresholdMetricEditor
        title="温度"
        icon={<Thermometer size={14} />}
        unit="℃"
        metric={temp}
        onChange={patchTemperature}
      />
      <ThresholdMetricEditor
        title="湿度"
        icon={<Droplets size={14} />}
        unit="%"
        metric={hum}
        onChange={patchHumidity}
      />

      {(hasUserIntent(temp) || hasUserIntent(hum)) && (
        <footer className="threshold-settings-foot">
          <button
            type="button"
            className="btn btn-ghost btn-sm threshold-clear"
            onClick={clearAll}
            title="このセンサーの閾値をすべて取り除く（逸脱判定を無効化）"
          >
            <Trash2 size={13} />
            <span>閾値をすべてクリア</span>
          </button>
        </footer>
      )}
    </div>
  )
}

function ThresholdMetricEditor({
  title,
  icon,
  unit,
  metric,
  onChange,
}: {
  title: string
  icon: React.ReactNode
  unit: string
  metric: ThresholdMetric
  onChange: (next: ThresholdMetric) => void
}) {
  function patchAlert(patch: Partial<ThresholdLevel>) {
    onChange({ ...metric, alert: { ...metric.alert, ...patch } })
  }
  function patchWarn(patch: Partial<ThresholdLevel>) {
    onChange({ ...metric, warn: { ...metric.warn, ...patch } })
  }

  return (
    <fieldset className="threshold-metric">
      <legend className="threshold-metric-legend">
        <span className="threshold-metric-title">
          {icon}
          <span>
            {title}（{unit}）
          </span>
        </span>
      </legend>

      <ThresholdLevelEditor
        kind="alert"
        title="危険"
        unit={unit}
        level={metric.alert}
        onChange={patchAlert}
      />
      <ThresholdLevelEditor
        kind="warn"
        title="注意"
        unit={unit}
        level={metric.warn}
        onChange={patchWarn}
      />

      <ValidationHint metric={metric} />
    </fieldset>
  )
}

function ThresholdLevelEditor({
  kind,
  title,
  unit,
  level,
  onChange,
}: {
  kind: 'alert' | 'warn'
  title: string
  unit: string
  level: ThresholdLevel
  onChange: (patch: Partial<ThresholdLevel>) => void
}) {
  const Icon = kind === 'alert' ? AlertOctagon : AlertTriangle
  const noteClass = kind === 'alert' ? 'threshold-icon-alert' : 'threshold-icon-warn'
  const description =
    kind === 'alert' ? '範囲外で赤（危険）' : '範囲外でオレンジ（注意）'

  return (
    <div
      className={`threshold-row threshold-row-${kind} ${level.enabled ? 'is-on' : 'is-off'}`}
    >
      <label className="threshold-row-toggle">
        <input
          type="checkbox"
          checked={level.enabled}
          onChange={(e) => {
            // チェックを外したら入力値はそのまま残し、enabled だけ false にする
            onChange({ enabled: e.target.checked })
          }}
        />
        <span className="threshold-row-label">
          <Icon size={12} className={noteClass} />
          {title}
          <span className="muted">（{description}）</span>
        </span>
      </label>

      <div className="threshold-row-inputs" aria-hidden={!level.enabled}>
        <label className="threshold-input-pair">
          <span className="threshold-input-pair-label">下限</span>
          <input
            type="number"
            step="0.1"
            value={level.min ?? ''}
            disabled={!level.enabled}
            onChange={(e) => onChange({ min: parseNumOrUndef(e.target.value) })}
            placeholder="未設定"
          />
          <span className="threshold-input-unit">{unit}</span>
          <span className="threshold-input-hint muted">未満で発動</span>
        </label>
        <label className="threshold-input-pair">
          <span className="threshold-input-pair-label">上限</span>
          <input
            type="number"
            step="0.1"
            value={level.max ?? ''}
            disabled={!level.enabled}
            onChange={(e) => onChange({ max: parseNumOrUndef(e.target.value) })}
            placeholder="未設定"
          />
          <span className="threshold-input-unit">{unit}</span>
          <span className="threshold-input-hint muted">超過で発動</span>
        </label>
      </div>
    </div>
  )
}

function ValidationHint({ metric }: { metric: ThresholdMetric }) {
  const issues: string[] = []

  function checkLevel(name: string, l: ThresholdLevel) {
    if (!l.enabled) return
    if (l.min != null && l.max != null && l.min > l.max) {
      issues.push(`${name}: 下限が上限より大きい値になっています`)
    }
  }
  checkLevel('危険', metric.alert)
  checkLevel('注意', metric.warn)

  // 注意レベルの境界が危険レベルより外側にあると論理的に整合しない
  if (
    metric.alert.enabled &&
    metric.warn.enabled &&
    metric.alert.min != null &&
    metric.warn.min != null &&
    metric.warn.min < metric.alert.min
  ) {
    issues.push('注意の下限は、危険の下限より大きい値にしてください')
  }
  if (
    metric.alert.enabled &&
    metric.warn.enabled &&
    metric.alert.max != null &&
    metric.warn.max != null &&
    metric.warn.max > metric.alert.max
  ) {
    issues.push('注意の上限は、危険の上限より小さい値にしてください')
  }

  if (issues.length === 0) return null
  return (
    <ul className="threshold-validation">
      {issues.map((m, i) => (
        <li key={i}>{m}</li>
      ))}
    </ul>
  )
}
