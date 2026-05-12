/**
 * Milesight 連携設定（Supabase `manufacturer_integrations` 連動）
 *
 * Admin Console の「Milesight 連携設定」タブからは
 *  - Webhook URL（テナント固有・Supabase Edge Function を直接指す）
 *  - MDP で発行された UUID / Secret の入力
 *  - 直近の `webhook_inbox` イベント
 * を表示し、MDP 側の Application 設定に貼り付けてもらう運用。
 *
 * 永続化は Supabase `manufacturer_integrations` テーブル
 * （`(organization_id, manufacturer)` で一意）。
 * `webhook_secret` の有無で `enabled` を同期する。
 * webhook 受信側 (Edge Function `webhook-milesight`) はこのテーブルを SELECT する。
 */
import { supabase } from '../../lib/supabase'
import type { ManufacturerIntegration, SensorKind } from '../../types'

const MANUFACTURER = 'Milesight'
const DEFAULT_SENSOR_KINDS: SensorKind[] = ['temperature-humidity']

type Row = {
  id: string
  organization_id: string
  manufacturer: string
  webhook_secret: string | null
  webhook_uuid: string | null
  sensor_kinds: string[] | null
  enabled: boolean | null
  updated_at: string
}

function fromRow(row: Row): ManufacturerIntegration {
  return {
    id: row.id,
    manufacturer: row.manufacturer,
    webhookSecret: row.webhook_secret ?? undefined,
    webhookUuid: row.webhook_uuid ?? undefined,
    sensorKinds: ((row.sensor_kinds ?? DEFAULT_SENSOR_KINDS) as SensorKind[]),
    updatedAt: new Date(row.updated_at),
  }
}

const SELECT_COLS =
  'id, organization_id, manufacturer, webhook_secret, webhook_uuid, sensor_kinds, enabled, updated_at'

/** Webhook URL（テナントごとに固有）。
 *  本番は `VITE_SUPABASE_URL` から Supabase Edge Function の URL を組み立てる。
 *  未設定時のみ window.location.origin にフォールバック（ローカル動作確認用）。 */
export function buildWebhookUrl(orgId: string): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/webhook-milesight/${orgId}`
  }
  const base =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://miterude.app'
  return `${base}/api/webhooks/milesight/${orgId}`
}

/** テナントの Milesight 連携設定を取得。未登録なら undefined。 */
export async function getMilesightIntegration(
  orgId: string,
): Promise<ManufacturerIntegration | undefined> {
  const { data, error } = await supabase
    .from('manufacturer_integrations')
    .select(SELECT_COLS)
    .eq('organization_id', orgId)
    .eq('manufacturer', MANUFACTURER)
    .maybeSingle()
  if (error) {
    console.error('[milesight] integration fetch error', error)
    return undefined
  }
  if (!data) return undefined
  return fromRow(data as Row)
}

/** 未作成なら空レコードを INSERT して返す。
 *  UUID / Secret は MDP 側で発行されるため、ここでは生成しない。 */
export async function ensureMilesightIntegration(
  orgId: string,
): Promise<ManufacturerIntegration> {
  const existing = await getMilesightIntegration(orgId)
  if (existing) return existing
  const { data, error } = await supabase
    .from('manufacturer_integrations')
    .insert({
      organization_id: orgId,
      manufacturer: MANUFACTURER,
      sensor_kinds: DEFAULT_SENSOR_KINDS,
      enabled: false,
    })
    .select(SELECT_COLS)
    .single()
  if (error || !data) {
    throw new Error(
      `Milesight 連携設定の初期化に失敗しました: ${error?.message ?? 'unknown'}`,
    )
  }
  return fromRow(data as Row)
}

/** UUID / Secret を更新する（admin が MDP からコピペした値を保存）。
 *  `webhookSecret` が入った時点で `enabled=true`、空になったら `enabled=false`。
 *  `patch` で未指定のフィールドは保持する。 */
export async function updateMilesightCredentials(
  orgId: string,
  patch: { webhookUuid?: string; webhookSecret?: string },
): Promise<ManufacturerIntegration> {
  // 既存行を必ず用意してから UPDATE する（無ければ INSERT）
  await ensureMilesightIntegration(orgId)

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (patch.webhookUuid !== undefined) {
    update.webhook_uuid = patch.webhookUuid.trim() || null
  }
  if (patch.webhookSecret !== undefined) {
    const trimmed = patch.webhookSecret.trim()
    update.webhook_secret = trimmed || null
    update.enabled = Boolean(trimmed)
  }

  const { data, error } = await supabase
    .from('manufacturer_integrations')
    .update(update)
    .eq('organization_id', orgId)
    .eq('manufacturer', MANUFACTURER)
    .select(SELECT_COLS)
    .single()
  if (error || !data) {
    throw new Error(
      `Milesight 連携設定の更新に失敗しました: ${error?.message ?? 'unknown'}`,
    )
  }
  return fromRow(data as Row)
}
