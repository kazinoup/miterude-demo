// Phase 1.4: 公開ダッシュボード用 Edge Function
//
// GET /functions/v1/share-dashboard?token=<token>
//   → { dashboard, organization, sensors[], devices[], readings[], categories[], groups[] }
//
// verify_jwt=false で誰でも叩ける。anon でも service_role でデータを返す。
// セキュリティ: token は 24 文字以上のランダム文字列。漏洩したら revoke してもらう前提。
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'no-store',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method-not-allowed' }, 405)
  }
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token || token.length < 16) return jsonResponse({ ok: false, error: 'invalid-token' }, 400)

  // 1) token で dashboard 検索
  const { data: dash, error: dashErr } = await supabase
    .from('dashboards')
    .select('id, organization_id, name, description, target_sensor_ids, default_period, widgets, public_share_token, public_share_issued_at, display_order, created_at, updated_at')
    .eq('public_share_token', token)
    .maybeSingle()
  if (dashErr) return jsonResponse({ ok: false, error: dashErr.message }, 500)
  if (!dash) return jsonResponse({ ok: false, error: 'not-found' }, 404)

  const orgId = dash.organization_id

  // 2) 組織情報（最小限）
  const { data: org } = await supabase
    .from('organizations').select('id, name, slug').eq('id', orgId).maybeSingle()
  if (!org) return jsonResponse({ ok: false, error: 'org-not-found' }, 404)

  // 3) 対象センサー + props
  const targetIds = dash.target_sensor_ids ?? []
  const { data: devices } = await supabase
    .from('devices')
    .select('id, organization_id, device_type, role, manufacturer, model, external_key, serial_number, dev_eui, name, device_number, category_id, group_id, tags, notification_group_id, online, last_seen_at, registered_at, metadata, created_at, updated_at')
    .eq('organization_id', orgId)
    .in('id', targetIds.length > 0 ? targetIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: sensorProps } = await supabase
    .from('sensor_props').select('device_id, gateway_id, thresholds, battery, alert_settings, exclusion_windows, exclusion_dates, created_at, updated_at')
    .in('device_id', (devices ?? []).map(d => d.id))

  // 4) カテゴリ + グループ
  const { data: categories } = await supabase
    .from('sensor_categories').select('id, name, icon, description, display_order, created_at, updated_at')
    .eq('organization_id', orgId).order('display_order', { ascending: true })
  const { data: groups } = await supabase
    .from('sensor_groups').select('id, name, description, color, display_order, created_at, updated_at')
    .eq('organization_id', orgId).order('display_order', { ascending: true })

  // 5) 直近 30 日の readings（公開ダッシュボードは最近のデータのみ）
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const readings = []
  if ((devices ?? []).length > 0) {
    let cursor = since
    while (true) {
      const { data, error } = await supabase
        .from('sensor_readings')
        .select('sensor_id, measured_at, temperature, humidity, battery')
        .in('sensor_id', devices.map(d => d.id))
        .gte('measured_at', cursor)
        .order('measured_at', { ascending: true })
        .limit(1000)
      if (error) { console.error('[share] readings', error); break }
      if (!data || data.length === 0) break
      readings.push(...data)
      if (data.length < 1000) break
      cursor = data[data.length - 1].measured_at
    }
  }

  return jsonResponse({
    ok: true,
    organization: org,
    dashboard: dash,
    devices: devices ?? [],
    sensorProps: sensorProps ?? [],
    categories: categories ?? [],
    groups: groups ?? [],
    readings,
  })
})
