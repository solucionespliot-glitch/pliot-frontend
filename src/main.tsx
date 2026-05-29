import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SiteProvider } from './hooks/useSiteContext'
import { router } from './router'
import { setupAuthInterceptor, restoreImpersonateOrg } from './services/api'
import './index.css'

restoreImpersonateOrg()

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
})

// Wires Auth0 token into axios on every request.
// We hold rendering children until the interceptor is registered to avoid a race
// condition where page-level useEffects fire API calls before the auth header is set.
function AuthSetup({ children }: { children: React.ReactNode }) {
  const { getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect } = useAuth0()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Wait until Auth0 finishes its silent-auth check before proceeding
    if (isLoading) return

    if (isAuthenticated) {
      setupAuthInterceptor(async () => {
        try {
          return await getAccessTokenSilently({
            authorizationParams: {
              audience: import.meta.env.VITE_AUTH0_AUDIENCE,
            },
          })
        } catch (err) {
          console.warn('[auth interceptor] token refresh failed, redirecting to login:', err)
          await loginWithRedirect({
            authorizationParams: {
              audience: import.meta.env.VITE_AUTH0_AUDIENCE,
              scope: 'openid profile email offline_access',
            },
          })
          throw err
        }
      })
    }

    // Interceptor is set up (or not needed for unauthenticated users).
    // Safe to render children now — PrivateRoute will redirect to /login if needed.
    setReady(true)
  }, [isAuthenticated, isLoading, getAccessTokenSilently, loginWithRedirect])

  if (!ready) return null

  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: 'openid profile email offline_access',
      }}
      useRefreshTokens={true}
      cacheLocation="localstorage"
    >
      <QueryClientProvider client={queryClient}>
        <SiteProvider>
          <AuthSetup>
            <RouterProvider router={router} />
          </AuthSetup>
        </SiteProvider>
      </QueryClientProvider>
    </Auth0Provider>
  </StrictMode>,
)
