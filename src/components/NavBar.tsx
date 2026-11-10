import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getOrganizations, impersonate } from '../services/settingsService'
import { setImpersonateOrg, fetchMe } from '../services/api'
import { getAlarmEvents } from '../services/alarmsService'

const BASE_NAV_LINKS = [
  { to: '/dashboard/devices',     label: 'Dispositivos',  feature: null,         hidden: false },
  { to: '/dashboard/irrigation',  label: 'Riego',         feature: null,         hidden: true  },
  { to: '/dashboard/controllers', label: 'Controladores', feature: 'controllers', hidden: false },
  { to: '/dashboard/alarms',      label: 'Alarmas',       feature: 'alarms',     hidden: false },
  { to: '/dashboard/settings',    label: 'Configuración', feature: null,         hidden: true  },
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
  const navigate = useNavigate()
  const [selectedOrg, setSelectedOrg] = useState(() => sessionStorage.getItem('impersonateOrg') ?? '')
  // On mobile, open the menu by default only on the site selector (no site chosen yet).
  // Once a site is selected and the user is in the dashboard, start closed.
  const [menuOpen, setMenuOpen] = useState(() => window.innerWidth < 640 && !sessionStorage.getItem('siteId'))
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const isSuperuser = me?.role === 'superuser'

  // Poll active unacknowledged alarms every 30s for the bell badge
  const { data: alarmData } = useQuery({
    queryKey: ['alarmsBadge'],
    queryFn: () => getAlarmEvents({ active: true, limit: 1 }),
    refetchInterval: 30_000,
    // Only fetch when the user is authenticated (me is loaded)
    enabled: !!me,
  })
  const unackedCount = alarmData?.unacked_active ?? 0

  // Filter nav links: hidden links are never shown, feature-flagged links require
  // the org to have that feature enabled (superusers bypass feature checks but not hidden).
  const NAV_LINKS = BASE_NAV_LINKS.filter(
    link => !link.hidden && (!link.feature || isSuperuser || me?.features?.[link.feature]),
  )

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
      position: 'sticky', top: 0, zIndex: 40,
      background: '#ffffff',
      borderBottom: '1px solid #E2E8E2',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Main bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/pliot-iso.png" alt="Pliot" style={{ height: 32, width: 32, objectFit: 'contain' }} />
          <span style={{ fontWeight: 700, fontSize: 17, color: '#1A1A1A', letterSpacing: '-0.3px', fontFamily: 'Inter, sans-serif' }}>
            Pliot
          </span>
        </div>

        {/* Desktop: nav links (center) */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 20 }}>
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to}
                style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}>
                {label}
              </NavLink>
            ))}
          </div>
        )}

        {/* Desktop: right side */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                    fontSize: 12, fontWeight: 600, cursor: !selectedOrg ? 'not-allowed' : 'pointer',
                  }}
                >
                  {impersonateMutation.isPending ? '...' : 'Ver'}
                </button>
                {sessionStorage.getItem('impersonateOrg') && (
                  <button
                    onClick={clearImpersonation}
                    title="Volver a mi org"
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E8E2', background: '#fff', color: '#6B7280', fontSize: 12, cursor: 'pointer' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
            {/* Alarm bell badge */}
            <button
              onClick={() => navigate('/dashboard/alarms')}
              title="Ver alarmas"
              style={{
                position: 'relative', background: 'none', border: 'none',
                cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center',
              }}
            >
              {/* Bell SVG icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={unackedCount > 0 ? '#DC2626' : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unackedCount > 0 && (
                <span style={{
                  position: 'absolute', top: 0, right: 0,
                  background: '#DC2626', color: '#fff',
                  borderRadius: '99px', fontSize: 10, fontWeight: 700,
                  minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', lineHeight: 1,
                }}>
                  {unackedCount > 99 ? '99+' : unackedCount}
                </span>
              )}
            </button>

            <span style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name ?? user?.email ?? '—'}
            </span>
            <button
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin + '/login' } })}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #E2E8E2', background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              Salir
            </button>
          </div>
        )}

        {/* Mobile: hamburger button */}
        {isMobile && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            style={{ background: 'none', border: '1px solid #E2E8E2', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: '#374151' }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        )}
      </div>

      {/* Mobile: dropdown menu */}
      {isMobile && menuOpen && (
        <div style={{ padding: '8px 20px 16px', borderTop: '1px solid #F3F4F6', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to} to={to}
              onClick={() => setMenuOpen(false)}
              style={({ isActive }) => ({
                padding: '12px 4px', fontSize: 15,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#1A7A1A' : '#374151',
                textDecoration: 'none',
                borderBottom: '1px solid #F3F4F6',
              })}
            >
              {label}
            </NavLink>
          ))}

          {/* Superuser org selector in mobile menu */}
          {isSuperuser && (
            <div style={{ padding: '12px 4px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Organización
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={selectedOrg}
                  onChange={e => setSelectedOrg(e.target.value)}
                  style={{ flex: 1, padding: '7px 8px', borderRadius: 6, border: '1px solid #E2E8E2', fontSize: 14, background: '#F7F9F7' }}
                >
                  <option value="">Mi org (defecto)</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button
                  disabled={!selectedOrg || impersonateMutation.isPending}
                  onClick={() => impersonateMutation.mutate()}
                  style={{
                    padding: '7px 14px', borderRadius: 6, border: 'none',
                    background: !selectedOrg ? '#F3F4F6' : '#2EB82A',
                    color: !selectedOrg ? '#9CA3AF' : '#fff',
                    fontSize: 13, fontWeight: 600, cursor: !selectedOrg ? 'not-allowed' : 'pointer',
                  }}
                >
                  {impersonateMutation.isPending ? '...' : 'Ver'}
                </button>
                {sessionStorage.getItem('impersonateOrg') && (
                  <button
                    onClick={clearImpersonation}
                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #E2E8E2', background: '#fff', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Logout */}
          <button
            onClick={() => { setMenuOpen(false); logout({ logoutParams: { returnTo: window.location.origin + '/login' } }) }}
            style={{ marginTop: 12, padding: '12px 4px', fontSize: 14, fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid #F3F4F6' }}
          >
            Salir · {user?.name ?? user?.email ?? '—'}
          </button>
        </div>
      )}
    </nav>
  )
}
