/**
 * Phase 1.4: 公開ダッシュボード閲覧ビュー（/share/dashboard/<token>）。
 *
 * 認証不要・読み取り専用。share-dashboard Edge Function 経由でデータを取得し、
 * 既存の Widget コンポーネントで描画する。
 *
 * 編集 / 確認記録 / センサー詳細遷移 / アラート発火 などは一切しない（no-op）。
 */
import { useEffect, useMemo, useState } from 'react'
import { LayoutDashboard, ExternalLink } from 'lucide-react'
import type {
  Dashboard,
  DeviceStore,
  GatewayStore,
  Sensor,
  SensorCategory,
  SensorCategoryStore,
  SensorGroup,
  SensorGroupStore,
  SensorReading,
  SensorRole,
  SensorStore,
  Widget,
} from '../../types'
import { TileWidget } from '../widgets/TileWidget'
import { ChartWidget } from '../widgets/ChartWidget'
import { MapWidget } from '../widgets/MapWidget'
import { DeviationWidget } from '../widgets/DeviationWidget'

type Props = {
  token: string
}

type ShareApiResponse = {
  ok: true
  organization: { id: string; name: string; slug: string }
  dashboard: {
    id: string
    organization_id: string
    name: string
    description: string | null
    target_sensor_ids: string[] | null
    default_period: unknown
    widgets: Widget[]
    public_share_token: string | null
    public_share_issued_at: string | null
    display_order: number
    created_at: string
    updated_at: string
  }
  devices: Array<{
    id: string
    organization_id: string
    device_type: 'sensor' | 'gateway'
    role: string
    manufacturer: string
    model: string
    external_key: string
    serial_number: string
    dev_eui: string | null
    name: string | null
    device_number: string
    category_id: string | null
    group_id: string | null
    tags: string[] | null
    notification_group_id: string | null
    online: boolean
    last_seen_at: string | null
    registered_at: string
    metadata: unknown
  }>
  sensorProps: Array<{
    device_id: string
    gateway_id: string | null
    thresholds: unknown
    battery: number | null
    alert_settings: unknown
    exclusion_windows: unknown
    exclusion_dates: unknown
  }>
  categories: Array<{
    id: string; name: string; icon: string | null; description: string | null
    display_order: number; created_at: string; updated_at: string
  }>
  groups: Array<{
    id: string; name: string; description: string | null; color: string | null
    display_order: number; created_at: string; updated_at: string
  }>
  readings: Array<{
    sensor_id: string
    measured_at: string
    temperature: number | null
    humidity: number | null
    battery: number | null
  }>
}

function buildStores(api: ShareApiResponse): {
  sensors: SensorStore
  devices: DeviceStore
  categories: SensorCategoryStore
  groups: SensorGroupStore
  gateways: GatewayStore
} {
  const propsByDeviceId = new Map<string, ShareApiResponse['sensorProps'][number]>()
  for (const p of api.sensorProps) propsByDeviceId.set(p.device_id, p)

  const sensors: SensorStore = {}
  for (const d of api.devices) {
    if (d.device_type !== 'sensor') continue
    const p = propsByDeviceId.get(d.id)
    const role = (d.role as SensorRole) ?? 'other'
    const sensor: Sensor = {
      id: d.id,
      deviceType: 'sensor',
      role,
      kind: role === 'temperature-humidity' || role === 'door' || role === 'current' ? role : undefined,
      manufacturer: d.manufacturer,
      model: d.model,
      externalKey: d.external_key,
      serialNumber: d.serial_number,
      devEUI: d.dev_eui ?? undefined,
      name: d.name ?? undefined,
      deviceNumber: d.device_number,
      categoryId: d.category_id,
      groupId: d.group_id,
      tags: d.tags ?? [],
      notificationGroupId: d.notification_group_id,
      online: d.online,
      lastSeenAt: d.last_seen_at ? new Date(d.last_seen_at) : undefined,
      registeredAt: new Date(d.registered_at),
      thresholds: (p?.thresholds as Sensor['thresholds']) ?? undefined,
      battery: p?.battery ?? 100,
      gatewayId: p?.gateway_id ?? '',
      alertSettings: (p?.alert_settings as Sensor['alertSettings']) ?? {
        offlineEnabled: true,
        offlineThresholdMinutes: 60,
        deviationEnabled: true,
        deviationConsecutiveCount: 3,
        notifyChannels: { email: true, slack: false, push: false },
      },
    }
    sensors[d.id] = sensor
  }

  const devices: DeviceStore = {}
  for (const r of api.readings) {
    const arr = devices[r.sensor_id] ?? (devices[r.sensor_id] = [])
    const reading: SensorReading = {
      deviceId: r.sensor_id,
      measuredAt: new Date(r.measured_at),
      temperature: r.temperature == null ? Number.NaN : Number(r.temperature),
      humidity: r.humidity == null ? Number.NaN : Number(r.humidity),
      battery: r.battery == null ? undefined : Number(r.battery),
    }
    arr.push(reading)
  }

  const categories: SensorCategoryStore = {}
  for (const c of api.categories) {
    const cat: SensorCategory = {
      id: c.id,
      name: c.name,
      icon: (c.icon as SensorCategory['icon']) ?? 'package',
      description: c.description ?? undefined,
      createdAt: new Date(c.created_at),
      updatedAt: new Date(c.updated_at),
    }
    categories[c.id] = cat
  }

  const groups: SensorGroupStore = {}
  for (const g of api.groups) {
    const grp: SensorGroup = {
      id: g.id,
      name: g.name,
      description: g.description ?? undefined,
      color: g.color ?? undefined,
      createdAt: new Date(g.created_at),
      updatedAt: new Date(g.updated_at),
    }
    groups[g.id] = grp
  }

  const gateways: GatewayStore = {}

  return { sensors, devices, categories, groups, gateways }
}

export function PublicDashboardView({ token }: Props) {
  const [api, setApi] = useState<ShareApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
    if (!url) {
      setError('Supabase URL が設定されていません')
      return
    }
    fetch(`${url}/functions/v1/share-dashboard?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok || !body?.ok) {
          throw new Error(body?.error ?? `${r.status} ${r.statusText}`)
        }
        if (!cancelled) setApi(body as ShareApiResponse)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [token])

  const stores = useMemo(() => api ? buildStores(api) : null, [api])

  if (error) {
    return (
      <div className="public-dash-page public-dash-error">
        <div className="public-dash-card">
          <h1>ダッシュボードを表示できません</h1>
          <p className="muted">
            URL が無効か、公開が取り消された可能性があります。
          </p>
          <p className="public-dash-error-detail muted small">{error}</p>
        </div>
      </div>
    )
  }
  if (!api || !stores) {
    return (
      <div className="public-dash-page">
        <div className="public-dash-card public-dash-loading">
          <div className="spinner" aria-hidden="true" />
          <span>読み込み中...</span>
        </div>
      </div>
    )
  }

  const dashboard: Dashboard = {
    id: api.dashboard.id,
    name: api.dashboard.name,
    description: api.dashboard.description ?? undefined,
    targetSensorIds: api.dashboard.target_sensor_ids ?? [],
    defaultPeriod: (api.dashboard.default_period as Dashboard['defaultPeriod']) ?? { type: 'week' },
    widgets: api.dashboard.widgets ?? [],
    publicShareToken: api.dashboard.public_share_token ?? undefined,
    publicShareIssuedAt: api.dashboard.public_share_issued_at ? new Date(api.dashboard.public_share_issued_at) : undefined,
    createdAt: new Date(api.dashboard.created_at),
    updatedAt: new Date(api.dashboard.updated_at),
  }

  // ダッシュボードの default_period から表示レンジを決める（直近 1日/7日/30日）
  const periodDays =
    dashboard.defaultPeriod.type === 'day' ? 1 :
    dashboard.defaultPeriod.type === 'month' ? 30 : 7
  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd.getTime() - periodDays * 24 * 60 * 60 * 1000)
  const range = { start: rangeStart, end: rangeEnd }
  const fineGrain = periodDays <= 1
  const effectiveSensorIds = dashboard.targetSensorIds ?? []

  const noop = () => undefined

  return (
    <div className="public-dash-page">
      <header className="public-dash-header">
        <div className="public-dash-header-line">
          <LayoutDashboard size={18} className="head-icon" />
          <span className="public-dash-org">{api.organization.name}</span>
          <span className="public-dash-sep">/</span>
          <span className="public-dash-name">{dashboard.name}</span>
        </div>
        <div className="public-dash-meta">
          <span className="muted small">読み取り専用・公開閲覧</span>
        </div>
      </header>

      {dashboard.description && (
        <p className="public-dash-desc muted">{dashboard.description}</p>
      )}

      <div className="public-dash-widgets">
        {dashboard.widgets.length === 0 ? (
          <div className="public-dash-empty muted">
            ウィジェットが登録されていません。
          </div>
        ) : (
          dashboard.widgets.map((w) => (
            <PublicWidgetCard
              key={w.id}
              widget={w}
              sensors={stores.sensors}
              devices={stores.devices}
              gateways={stores.gateways}
              categories={stores.categories}
              effectiveSensorIds={effectiveSensorIds}
              range={range}
              fineGrain={fineGrain}
              onOpenSensor={noop}
            />
          ))
        )}
      </div>

      <footer className="public-dash-footer muted small">
        <ExternalLink size={12} />
        ミテルデ — IoT モニタリング
      </footer>
    </div>
  )
}

/** ウィジェット 1 件を描画する小さなラッパー。型に応じて分岐。 */
function PublicWidgetCard(props: {
  widget: Widget
  sensors: SensorStore
  devices: DeviceStore
  gateways: GatewayStore
  categories: SensorCategoryStore
  effectiveSensorIds: string[]
  range: { start: Date; end: Date }
  fineGrain: boolean
  onOpenSensor: (id: string) => void
}) {
  const { widget, sensors, devices, gateways, categories, effectiveSensorIds, range, fineGrain, onOpenSensor } = props

  if (widget.type === 'tiles') {
    return (
      <section className={`public-dash-widget public-dash-widget-${widget.span}`}>
        <div className="public-dash-widget-head">
          <h2>{widget.title || 'タイル'}</h2>
        </div>
        <TileWidget
          widget={widget}
          devices={devices}
          sensors={sensors}
          gateways={gateways}
          categories={categories}
          onOpenSensor={onOpenSensor}
        />
      </section>
    )
  }
  if (widget.type === 'chart') {
    return (
      <section className={`public-dash-widget public-dash-widget-${widget.span}`}>
        <div className="public-dash-widget-head">
          <h2>{widget.title || 'グラフ'}</h2>
        </div>
        <ChartWidget
          widget={widget}
          devices={devices}
          sensors={sensors}
          effectiveSensorIds={effectiveSensorIds}
          range={range}
          fineGrain={fineGrain}
        />
      </section>
    )
  }
  if (widget.type === 'map') {
    return (
      <section className={`public-dash-widget public-dash-widget-${widget.span}`}>
        <div className="public-dash-widget-head">
          <h2>{widget.title || 'マップ'}</h2>
        </div>
        <MapWidget
          widget={widget}
          sensors={sensors}
          devices={devices}
          categories={categories}
          onUpdate={() => undefined}
          onOpenSensor={onOpenSensor}
          editable={false}
        />
      </section>
    )
  }
  if (widget.type === 'deviation') {
    return (
      <section className={`public-dash-widget public-dash-widget-${widget.span}`}>
        <div className="public-dash-widget-head">
          <h2>{widget.title || '逸脱ピックアップ'}</h2>
        </div>
        <DeviationWidget
          widget={widget}
          devices={devices}
          sensors={sensors}
          effectiveSensorIds={effectiveSensorIds}
          range={range}
          onOpenSensor={onOpenSensor}
        />
      </section>
    )
  }
  return null
}
