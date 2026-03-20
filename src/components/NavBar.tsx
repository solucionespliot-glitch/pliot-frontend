import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getOrganizations, impersonate } from '../services/settingsService'
import { setAuthToken } from '../services/api'

const ROLES_CLAIM = `${import.meta.env.VITE_AUTH0_AUDIENCE}/roles`

const NAV_LINKS = [
  { to: '/dashboard/devices',     label: 'Dispositivos'  },
  { to: '/dashboard/irrigation',  label: 'Riego'         },
  { to: '/dashboard/controllers', label: 'Controladores' },
  { to: '/dashboard/settings',    label: 'Configuración' },
]

const activeLinkStyle: React.CSSProperties = {
  color: '#4f46e5',
  fontWeight: 700,
  borderBottom: '2px solid #4f46e5',
  paddingBottom: 2,
}

const linkStyle: React.CSSProperties = {
  color: '#374151',
  fontWeight: 500,
  textDecoration: 'none',
  fontSize: 14,
  paddingBottom: 2,
  borderBottom: '2px solid transparent',
  transition: 'color 0.15s',
}

export default function NavBar() {
  const { user, logout } = useAuth0()
  const [selectedOrg, setSelectedOrg] = useState('')

  const userRoles: string[] = (user?.[ROLES_CLAIM] as string[]) ?? []
  const isSuperuser = userRoles.includes('superuser')

  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: getOrganizations,
    enabled: isSuperuser,
  })

  const impersonateMutation = useMutation({
    mutationFn: () => impersonate(selectedOrg),
    onSuccess: ({ token }) => {
      setAuthToken(token)
      window.location.reload()
    },
  })

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: 56,
      background: '#fff',
      borderBottom: '1px solid #e5e7eb',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      {/* Logo + links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: '#111827', letterSpacing: '-0.5px' }}>
          Pliot
        </span>
        <div style={{ display: 'flex', gap: 20 }}>
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Superuser org impersonation */}
        {isSuperuser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={selectedOrg}
              onChange={e => setSelectedOrg(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, maxWidth: 160 }}
            >
              <option value="">Impersonar org...</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button
              disabled={!selectedOrg || impersonateMutation.isPending}
              onClick={() => impersonateMutation.mutate()}
              style={{
                padding: '4px 10px', borderRadius: 6, border: 'none',
                background: !selectedOrg ? '#e5e7eb' : '#4f46e5',
                color: !selectedOrg ? '#9ca3af' : '#fff',
                fontSize: 12, fontWeight: 600,
                cursor: !selectedOrg ? 'not-allowed' : 'pointer',
              }}
            >
              {impersonateMutation.isPending ? '...' : 'OK'}
            </button>
          </div>
        )}

        {/* User name */}
        <span style={{ fontSize: 13, color: '#6b7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name ?? user?.email ?? '—'}
        </span>

        {/* Logout */}
        <button
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin + '/login' } })}
          style={{
            padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Salir
        </button>
      </div>
    </nav>
  )
}
