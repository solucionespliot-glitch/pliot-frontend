import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

/**
 * Attach a raw Auth0 JWT before calling this function.
 * Usage: setAuthToken(await getAccessTokenSilently({ authorizationParams: { audience } }))
 */
export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

export function clearAuthToken() {
  delete api.defaults.headers.common['Authorization']
}
