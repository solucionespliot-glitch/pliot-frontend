import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useSiteContext } from '../hooks/useSiteContext'
import NavBar from '../components/NavBar'

interface Site {
  id: string
  name: string
}

async function fetchSites(): Promise<Site[]> {
  const { data } = await api.get<{ sites: Site[] }>('/dashboard/sites')
  return data.sites ?? (data as unknown as Site[])
}

export default function SiteSelector() {
  const navigate = useNavigate()
  const { setSiteId } = useSiteContext()
  const { data: sites, isLoading, isError } = useQuery({ queryKey: ['sites'], queryFn: fetchSites })
  const [hovered, setHovered] = useState<string | null>(null)

  function handleSelect(site: Site) {
    setSiteId(site.id)
    navigate('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--p-bg)' }}>
      <NavBar />

      {/* Contenido centrado */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
          <img src="/pliot-iso.png" alt="Pliot" style={{ height: 72, width: 72, objectFit: 'contain', marginBottom: 12 }} />
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-text)', letterSpacing: '-0.5px', fontFamily: 'Inter, sans-serif' }}>
            Pliot
          </span>
          <span style={{ fontSize: 12, color: 'var(--p-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 4 }}>
            Smart Agriculture
          </span>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          border: '1px solid var(--p-border)',
          borderRadius: 20,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          padding: '36px 32px',
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, color: 'var(--p-text)', textAlign: 'center' }}>
            Seleccioná tu campo
          </h2>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--p-text-muted)', textAlign: 'center' }}>
            Elegí el establecimiento para ver sus datos
          </p>

          {isLoading && <p style={{ color: 'var(--p-text-secondary)', margin: 0 }}>Cargando campos...</p>}
          {isError  && <p style={{ color: 'var(--p-error)', margin: 0 }}>Error al cargar los campos.</p>}

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sites?.map((site) => (
              <button
                key={site.id}
                onClick={() => handleSelect(site)}
                onMouseEnter={() => setHovered(site.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: 12,
                  border: hovered === site.id ? '2px solid var(--p-primary)' : '2px solid var(--p-border)',
                  background: hovered === site.id ? '#F0FBF0' : 'var(--p-bg)',
                  color: hovered === site.id ? 'var(--p-primary-dark)' : 'var(--p-text)',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s',
                }}
              >
                <span>🌿 {site.name}</span>
                <span style={{ fontSize: 18, color: hovered === site.id ? 'var(--p-primary)' : 'var(--p-text-muted)' }}>→</span>
              </button>
            ))}
          </div>

          {!isLoading && !isError && sites?.length === 0 && (
            <p style={{ color: 'var(--p-text-muted)', textAlign: 'center', margin: 0 }}>
              No hay campos disponibles para tu cuenta.
            </p>
          )}
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--p-text-muted)' }}>
          Pliot Smart Agriculture © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
