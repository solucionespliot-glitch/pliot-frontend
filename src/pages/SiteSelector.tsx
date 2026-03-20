import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'

interface Site {
  id: string
  name: string
}

async function fetchSites(): Promise<Site[]> {
  const { data } = await api.get<Site[]>('/dashboard/sites')
  return data
}

export default function SiteSelector() {
  const navigate = useNavigate()
  const { data: sites, isLoading, isError } = useQuery({ queryKey: ['sites'], queryFn: fetchSites })

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#f5f5f5',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '40px 32px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        minWidth: 360,
      }}>
        <h2 style={{ marginTop: 0, color: '#1a1a2e' }}>Seleccioná un campo para continuar</h2>

        {isLoading && <p>Cargando campos...</p>}
        {isError && <p style={{ color: 'red' }}>Error al cargar los campos.</p>}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sites?.map((site) => (
            <li key={site.id}>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 16px',
                  background: '#f0f4ff',
                  border: '1px solid #c7d7ff',
                  borderRadius: 8,
                  fontSize: 15,
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: '#1a1a2e',
                }}
              >
                {site.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
