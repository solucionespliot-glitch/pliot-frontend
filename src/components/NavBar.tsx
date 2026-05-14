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
  color: '#ffffff',
  fontWeight: 700,
  borderBottom: '2px solid #8DC63F',
  paddingBottom: 2,
  opacity: 1,
}

const linkStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.75)',
  fontWeight: 500,
  textDecoration: 'none',
  fontSize: 14,
  paddingBottom: 2,
  borderBottom: '2px solid transparent',
  transition: 'color 0.15s, opacity 0.15s',
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
      height: 52,
      background: '#1A7A1A',
      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      {/* Logo + links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <span style={{ fontWeight: 700, fontSize: 18, color: '#ffffff', letterSpacing: '-0.3px', fontFamily: 'Inter, sans-serif' }}>
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
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: '#1A5C1A', color: '#fff', fontSize: 13, maxWidth: 160 }}
            >
              <option value="" style={{ background: '#1A5C1A', color: '#fff' }}>Mi org (defecto)</option>
              {orgs.map(o => <option key={o.id} value={o.id} style={{ background: '#1A5C1A', color: '#fff' }}>{o.name}</option>)}
            </select>
            <button
              disabled={!selectedOrg || impersonateMutation.isPending}
              onClick={() => impersonateMutation.mutate()}
              style={{
                padding: '4px 10px', borderRadius: 6, border: 'none',
                background: !selectedOrg ? 'rgba(255,255,255,0.15)' : '#8DC63F',
                color: !selectedOrg ? 'rgba(255,255,255,0.4)' : '#fff',
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
                  padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
                  background: 'transparent', color: 'rgba(255,255,255,0.75)', fontSize: 12, cursor: 'pointer',
                }}
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        {/* User name */}
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name ?? user?.email ?? '—'}
        </span>

        {/* Logout */}
        <button
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin + '/login' } })}
          style={{
            padding: '5px 12px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'transparent', color: 'rgba(255,255,255,0.85)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Salir
        </button>
      </div>
    </nav>
  )
}
