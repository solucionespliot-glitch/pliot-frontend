import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getOrganizations, impersonate } from '../services/settingsService'
import { setImpersonateOrg, fetchMe } from '../services/api'

const NAV_LINKS = [
  { to: '/dashboard/devices',     label: 'Dispositivos'  },
  { to: '/dashboard/irrigation',  label: 'Riego'         },
  { to: '/dashboard/controllers', label: 'Controladores' },
  { to: '/dashboard/settings',    label: 'Configuración' },
]

const activeLinkStyle: React.CSSProperties = {
  color: '#1A7A1A',
  fontWeight: 600,
  borderBottom: '2px solid #2EB82A',
  paddingBottom: 2,
}

const linkStyle: React.CSSProperties = {
  color: '#6B7280',
  fontWeight: 500,
  textDecoration: 'none',
  fontSize: 14,
  paddingBottom: 2,
  borderBottom: '2px solid transparent',
  transition: 'color 0.15s',
}

export default function NavBar() {
  const { user, logout } = useAuth0()
  const [selectedOrg, setSelectedOrg] = useState(() => sessionStorage.getItem('impersonateOrg') ?? '')

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const isSuperuser = me?.role === 'superuser'

  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: getOrganizations,
    enabled: isSuperuser,
  })

  const impersonateMutation = useMutation({
    mutationFn: () => impersonate(selectedOrg),
    onSuccess: (data) => {
      setImpersonateOrg(data.organization_id)
      sessionStorage.removeItem('siteId')
      window.location.href = '/select-site'
    },
  })

  function clearImpersonation() {
    setImpersonateOrg(null)
    setSelectedOrg('')
    sessionStorage.removeItem('siteId')
    window.location.href = '/select-site'
  }

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      height: 56,
      background: '#ffffff',
      borderBottom: '1px solid #E2E8E2',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      {/* Logo + links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/pliot-iso.png" alt="Pliot" style={{ height: 32, width: 32, objectFit: 'contain' }} />
          <span style={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', letterSpacing: '-0.3px', fontFamily: 'Inter, sans-serif' }}>
            Pliot
          </span>
        </div>
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
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E8E2', background: '#F7F9F7', color: '#1A1A1A', fontSize: 13, maxWidth: 160 }}
            >
              <option value="">Mi org (defecto)</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button
              disabled={!selectedOrg || impersonateMutation.isPending}
              onClick={() => impersonateMutation.mutate()}
              style={{
                padding: '4px 10px', borderRadius: 6, border: 'none',
                background: !selectedOrg ? '#F3F4F6' : '#2EB82A',
                color: !selectedOrg ? '#9CA3AF' : '#fff',
                fontSize: 12, fontWeight: 600,
                cursor: !selectedOrg ? 'not-allowed' : 'pointer',
              }}
            >
              {impersonateMutation.isPending ? '...' : 'Ver'}
            </button>
            {sessionStorage.getItem('impersonateOrg') && (
              <button
                onClick={clearImpersonation}
                title="Volver a mi org"
                style={{
                  padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E8E2',
                  background: '#fff', color: '#6B7280', fontSize: 12, cursor: 'pointer',
                }}
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        {/* User name */}
        <span style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name ?? user?.email ?? '—'}
        </span>

        {/* Logout */}
        <button
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin + '/login' } })}
          style={{
            padding: '5px 12px', borderRadius: 6,
            border: '1px solid #E2E8E2',
            background: '#fff', color: '#6B7280',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Salir
        </button>
      </div>
    </nav>
  )
}
