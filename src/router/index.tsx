import { createBrowserRouter, Navigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../services/api'
import PrivateRoute from '../components/PrivateRoute'
import LoginPage from '../pages/LoginPage'
import SiteSelector from '../pages/SiteSelector'
import DashboardLayout from '../pages/dashboard/DashboardLayout'
import DevicesModule from '../pages/dashboard/DevicesModule'
import TelemetryModule from '../pages/dashboard/TelemetryModule'
import IrrigationModule from '../pages/dashboard/IrrigationModule'
import ControllersModule from '../pages/dashboard/ControllersModule'
import SettingsModule from '../pages/dashboard/SettingsModule'
import LotsModule from '../pages/dashboard/LotsModule'
import LotDetailModule from '../pages/dashboard/LotDetailModule'
import CycleDetailModule from '../pages/dashboard/CycleDetailModule'
import NurseryModule from '../pages/dashboard/NurseryModule'

// Redirects to /dashboard if the org doesn't have the required feature
function FeatureRoute({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  if (!me) return null
  if (!me.features[feature]) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth0()

  if (isLoading) return null

  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/select-site',
    element: (
      <PrivateRoute>
        <SiteSelector />
      </PrivateRoute>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <PrivateRoute>
        <DashboardLayout />
      </PrivateRoute>
    ),
    children: [
      { index: true, element: <DevicesModule /> },
      { path: 'devices', element: <DevicesModule /> },
      { path: 'telemetry/:deviceId', element: <TelemetryModule /> },
      { path: 'irrigation', element: <IrrigationModule /> },
      { path: 'controllers', element: <ControllersModule /> },
      { path: 'settings', element: <SettingsModule /> },
      { path: 'lots', element: <FeatureRoute feature="lots"><LotsModule /></FeatureRoute> },
      { path: 'lots/:lotId', element: <FeatureRoute feature="lots"><LotDetailModule /></FeatureRoute> },
      { path: 'cycles/:cycleId', element: <FeatureRoute feature="lots"><CycleDetailModule /></FeatureRoute> },
      { path: 'nursery', element: <FeatureRoute feature="nursery"><NurseryModule /></FeatureRoute> },
    ],
  },
])
