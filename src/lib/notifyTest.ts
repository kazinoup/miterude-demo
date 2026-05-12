/**
 * Phase 1.7b: 通知チャネルのテスト送信
 *
 * NotificationGroupEditDialog から個別チャネルに「テスト送信」を打つときの
 * クライアント側ヘルパ。Supabase Edge Function `send-notification-test` を呼び、
 * 結果（成功 / 失敗 + エラーメッセージ）をそのまま返す。
 */
import { supabase } from './supabase'
import type { NotificationChannelKind } from '../types'

export type TestSendResult = { ok: true } | { ok: false; error: string }

export async function sendTestNotification(params: {
  channelKind: NotificationChannelKind
  target: string
  organizationId?: string
}): Promise<TestSendResult> {
  const { channelKind, target, organizationId } = params
  if (!target.trim()) {
    return { ok: false, error: '送信先が空です' }
  }
  try {
    const { data, error } = await supabase.functions.invoke('send-notification-test', {
      body: {
        channel_kind: channelKind,
        target,
        organization_id: organizationId,
      },
    })
    if (error) {
      return { ok: false, error: error.message ?? 'invoke failed' }
    }
    if (data && typeof data === 'object' && 'ok' in data) {
      if ((data as { ok: boolean }).ok) return { ok: true }
      return {
        ok: false,
        error: (data as { error?: string }).error ?? 'unknown error',
      }
    }
    return { ok: false, error: 'unexpected response' }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
