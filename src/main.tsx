import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installDemoResetHook } from './lib/demoReset'
import { resolveActiveOrgFromUrl } from './lib/tenantResolver'
import { PublicDashboardView } from './components/views/PublicDashboardView'

// URL クエリ `?reset=demo` や console `miterudeResetDemo()` で
// localStorage を初期化できるようにする。React より前に実行。
installDemoResetHook()

/** /share/dashboard/<token> なら公開ビュー、それ以外は通常の App をマウント。 */
function extractShareToken(): string | null {
  if (typeof window === 'undefined') return null
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] === 'share' && parts[1] === 'dashboard' && parts[2]) {
    return parts[2]
  }
  return null
}

const shareToken = extractShareToken()

if (shareToken) {
  // 公開ダッシュボード: テナント解決もログイン状態のチェックもしない
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <PublicDashboardView token={shareToken} />
      </ErrorBoundary>
    </StrictMode>,
  )
} else {
  // URL の <slug> から active org を解決してから React マウント。
  // supabaseQueries の全クエリはこの後 getActiveOrgId() を参照する。
  ;(async () => {
    await resolveActiveOrgFromUrl().catch((e) => {
      console.warn('[boot] resolveActiveOrgFromUrl failed, falling back to demo', e)
    })
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  })()
}
