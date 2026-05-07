/**
 * アラート一覧の列表示・並び順設定 — Phase（センサー一覧と同じ仕組み）
 *
 * 「発生日時」は左端固定（必須）。それ以外の列は表示／非表示・並び順を localStorage に永続化する。
 */

export type AlertColumnKey =
  | 'targetDevice' // 対象デバイス（名前 + 種別バッジ）
  | 'kind' // アラート種別（バッジ）
  | 'message' // 内容（説明文）
  | 'category' // 区分（センサーターゲットのみ）
  | 'group' // グループ（センサーターゲットのみ）
  | 'tags' // タグ（センサーターゲットのみ）
  | 'confirmComment' // 確認メモ（ダッシュボード確認時に記録されるメモ）
  | 'manufacturer' // メーカー
  | 'model' // モデル
  | 'serialNumber' // シリアル番号
  | 'sensorNumber' // センサー番号

export type AlertColumnVisibility = Record<AlertColumnKey, boolean>

export type AlertColumnDef = {
  key: AlertColumnKey
  label: string
  hint?: string
  defaultVisible: boolean
}

export const ALERT_COLUMN_DEFS: AlertColumnDef[] = [
  {
    key: 'targetDevice',
    label: '対象デバイス',
    hint: 'センサー / ゲートウェイの名称と種別',
    defaultVisible: true,
  },
  {
    key: 'kind',
    label: '種別',
    hint: '逸脱（危険）/ 逸脱（注意）/ オフライン / バッテリー残量',
    defaultVisible: true,
  },
  {
    key: 'message',
    label: '内容',
    hint: '何がどう逸脱したかの 1 行説明',
    defaultVisible: true,
  },
  {
    key: 'category',
    label: '区分',
    hint: 'センサー個別の区分（ターゲットがセンサー時のみ）',
    defaultVisible: true,
  },
  {
    key: 'group',
    label: 'グループ',
    hint: 'センサーが属するグループ',
    defaultVisible: true,
  },
  {
    key: 'tags',
    label: 'タグ',
    hint: 'センサーに付与されたタグ',
    defaultVisible: true,
  },
  {
    key: 'confirmComment',
    label: '確認メモ',
    hint: 'ダッシュボード確認記録から連携されたメモ',
    defaultVisible: true,
  },
  {
    key: 'manufacturer',
    label: 'メーカー',
    defaultVisible: false,
  },
  {
    key: 'model',
    label: 'モデル',
    defaultVisible: false,
  },
  {
    key: 'serialNumber',
    label: 'シリアル番号',
    defaultVisible: false,
  },
  {
    key: 'sensorNumber',
    label: 'センサー番号',
    defaultVisible: false,
  },
]

const STORAGE_KEY = 'miterude:alerts:columns:v1'
const ORDER_KEY = 'miterude:alerts:columnOrder:v1'

export function defaultColumnVisibility(): AlertColumnVisibility {
  const out = {} as AlertColumnVisibility
  for (const def of ALERT_COLUMN_DEFS) {
    out[def.key] = def.defaultVisible
  }
  return out
}

export function loadColumnVisibility(): AlertColumnVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultColumnVisibility()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaultColumnVisibility()
    const out = defaultColumnVisibility()
    for (const k of Object.keys(out) as AlertColumnKey[]) {
      if (typeof parsed[k] === 'boolean') out[k] = parsed[k]
    }
    return out
  } catch {
    return defaultColumnVisibility()
  }
}

export function saveColumnVisibility(v: AlertColumnVisibility): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    /* noop */
  }
}

export function defaultColumnOrder(): AlertColumnKey[] {
  return ALERT_COLUMN_DEFS.map((d) => d.key)
}

export function loadColumnOrder(): AlertColumnKey[] {
  const def = defaultColumnOrder()
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return def
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return def
    const validSet = new Set<AlertColumnKey>(def)
    const seen = new Set<AlertColumnKey>()
    const valid: AlertColumnKey[] = []
    for (const k of parsed) {
      if (
        typeof k === 'string' &&
        validSet.has(k as AlertColumnKey) &&
        !seen.has(k as AlertColumnKey)
      ) {
        valid.push(k as AlertColumnKey)
        seen.add(k as AlertColumnKey)
      }
    }
    for (const k of def) {
      if (!seen.has(k)) valid.push(k)
    }
    return valid
  } catch {
    return def
  }
}

export function saveColumnOrder(order: AlertColumnKey[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order))
  } catch {
    /* noop */
  }
}
