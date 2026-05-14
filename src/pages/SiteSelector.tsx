import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useSiteContext } from '../hooks/useSiteContext'

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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      // Imagen de fondo — reemplazar field-bg.jpg por la foto del campo
      // Colocar la imagen en pliot-frontend/public/field-bg.jpg
      backgroundImage: `
        linear-gradient(rgba(0,0,0,0.52), rgba(20,60,20,0.72)),
        url('/field-bg.jpg')
      `,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      // Fallback si no hay imagen: degradé verde
      backgroundColor: '#1A7A1A',
      padding: '24px 16px',
    }}>

      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
        <img src="/pliot-iso.png" alt="Pliot" style={{ height: 72, width: 72, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 12 }} />
        <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', fontFamily: 'Inter, sans-serif' }}>
          Pliot
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 4 }}>
          Smart Agriculture
        </span>
      </div>

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.10)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.20)',
        borderRadius: 20,
        padding: '36px 32px',
        width: '100%',
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600, color: '#fff', textAlign: 'center' }}>
          Seleccioná tu campo
        </h2>

        {isLoading && (
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>Cargando campos...</p>
        )}
        {isError && (
          <p style={{ color: '#FCA5A5', margin: 0 }}>Error al cargar los campos.</p>
        )}

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sites?.map((site) => (
            <button
              key={site.id}
              onClick={() => handleSelect(site)}
              onMouseEnter={() => setHovered(site.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: '100%',
                padding: '18px 24px',
                borderRadius: 12,
                border: hovered === site.id
                  ? '2px solid #8DC63F'
                  : '2px solid rgba(255,255,255,0.25)',
                background: hovered === site.id
                  ? 'rgba(141,198,63,0.18)'
                  : 'rgba(255,255,255,0.10)',
                color: '#fff',
                fontSize: 17,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s',
                letterSpacing: '-0.2px',
              }}
            >
              <span>🌿 {site.name}</span>
              <span style={{ fontSize: 20, opacity: 0.7 }}>→</span>
            </button>
          ))}
        </div>

        {!isLoading && !isError && sites?.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', margin: 0 }}>
            No hay campos disponibles para tu cuenta.
          </p>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
        Pliot Smart Agriculture © {new Date().getFullYear()}
      </p>
    </div>
  )
}
