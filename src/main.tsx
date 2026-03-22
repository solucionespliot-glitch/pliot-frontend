import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SiteProvider } from './hooks/useSiteContext'
import { router } from './router'
import { setupAuthInterceptor } from './services/api'
import './index.css'

const queryClient = new QueryClient()

// Wires Auth0 token into axios on every request
function AuthSetup({ children }: { children: React.ReactNode }) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  useEffect(() => {
    if (isAuthenticated) {
      setupAuthInterceptor(() =>
        getAccessTokenSilently({
          authorizationParams: {
            audience: import.meta.env.VITE_AUTH0_AUDIENCE,
          },
        }),
      )
    }
  }, [isAuthenticated, getAccessTokenSilently])

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
      }}
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
