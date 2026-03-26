import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

export function clearAuthToken() {
  delete api.defaults.headers.common['Authorization']
}

// ── Current user ─────────────────────────────────────────────────────────────

export interface Me {
  auth0_sub: string
  organization_id: string
  role: string
}

export async function fetchMe(): Promise<Me> {
  const { data } = await api.get<Me>('/dashboard/me')
  return data
}

// ── Impersonation header ──────────────────────────────────────────────────────

const IMPERSONATE_KEY = 'impersonateOrg'

export function setImpersonateOrg(orgId: string | null) {
  if (orgId) {
    api.defaults.headers.common['X-Impersonate-Org'] = orgId
    sessionStorage.setItem(IMPERSONATE_KEY, orgId)
  } else {
    delete api.defaults.headers.common['X-Impersonate-Org']
    sessionStorage.removeItem(IMPERSONATE_KEY)
  }
}

// Call on app init to re-apply header after a page reload
export function restoreImpersonateOrg() {
  const orgId = sessionStorage.getItem(IMPERSONATE_KEY)
  if (orgId) api.defaults.headers.common['X-Impersonate-Org'] = orgId
}

// Call once on app init with Auth0's getAccessTokenSilently
// Sets up a request interceptor that refreshes the token automatically
let interceptorId: number | null = null

export function setupAuthInterceptor(getToken: () => Promise<string>) {
  if (interceptorId !== null) {
    api.interceptors.request.eject(interceptorId)
  }
  interceptorId = api.interceptors.request.use(async (config) => {
    try {
      const token = await getToken()
      config.headers['Authorization'] = `Bearer ${token}`
    } catch (err) {
      console.warn('[auth interceptor] getAccessTokenSilently failed:', err)
    }
    return config
  })
}
