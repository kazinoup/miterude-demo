// Phase 1.5a: モック認証 Edge Function
//
// POST /functions/v1/mock-login
//   Body: { email: string, password: string }
//   Response:
//     - { ok: true, user: AppUser, memberships: OrganizationMember[] }
//     - { ok: false, error: 'user-not-found' | 'invalid-password' | 'no-password-set' | ... }
//
// 仕様:
//   - super_admin / support / sales 等の内部スタッフ: password_hash と SHA-256 で比較
//   - tenant ユーザー (system_role=null): password は無視して常に OK
//   - email は case-insensitive で照合
//
// Clerk 統合時に削除（Clerk の認証フローに置き換え）。
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method-not-allowed' }, 405)

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'invalid-body' }, 400)
  }
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  if (!email) return jsonResponse({ ok: false, error: 'email-required' }, 400)

  // 1) email でユーザー lookup
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, display_name, clerk_user_id, system_role, staff_category, password_hash, created_at, updated_at')
    .ilike('email', email)
    .maybeSingle()
  if (userErr) {
    console.error('[mock-login] user lookup error', userErr)
    return jsonResponse({ ok: false, error: 'lookup-failed' }, 500)
  }
  if (!user) return jsonResponse({ ok: false, error: 'user-not-found' }, 404)

  // 2) 内部スタッフはパスワード検証
  const isInternal = user.system_role === 'super_admin' || user.system_role === 'support'
  if (isInternal) {
    if (!user.password_hash) {
      return jsonResponse({ ok: false, error: 'no-password-set' }, 401)
    }
    if (!password) return jsonResponse({ ok: false, error: 'password-required' }, 401)
    const inputHash = await sha256Hex(password)
    if (inputHash !== user.password_hash) {
      return jsonResponse({ ok: false, error: 'invalid-password' }, 401)
    }
  }
  // tenant ユーザーは password 何でも OK（モック前提）

  // 3) tenant ユーザーの場合: organization_members を引いて返す
  let memberships: Array<{ organization_id: string; role: string }> = []
  if (!isInternal) {
    const { data: mems, error: memErr } = await supabase
      .from('organization_members')
      .select('id, organization_id, user_id, role, invited_at, first_login_at, last_login_at')
      .eq('user_id', user.id)
    if (memErr) {
      console.error('[mock-login] memberships error', memErr)
    } else {
      memberships = (mems ?? []) as typeof memberships
    }
  }

  // 4) password_hash を返さないようマスク
  const { password_hash: _ph, ...userPublic } = user
  return jsonResponse({ ok: true, user: userPublic, memberships })
})
