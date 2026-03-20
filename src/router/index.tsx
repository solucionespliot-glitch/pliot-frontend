import { createBrowserRouter, Navigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import PrivateRoute from '../components/PrivateRoute'
import LoginPage from '../pages/LoginPage'
import SiteSelector from '../pages/SiteSelector'
import DashboardLayout from '../pages/dashboard/DashboardLayout'
import DevicesModule from '../pages/dashboard/DevicesModule'
import TelemetryModule from '../pages/dashboard/TelemetryModule'
import IrrigationModule from '../pages/dashboard/IrrigationModule'
import ControllersModule from '../pages/dashboard/ControllersModule'
import SettingsModule from '../pages/dashboard/SettingsModule'

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
    ],
  },
])
