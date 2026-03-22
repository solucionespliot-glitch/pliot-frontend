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
    } catch {
      // not authenticated — proceed without token
    }
    return config
  })
}
