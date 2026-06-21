import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getLotDetail, createLotEvent, patchLot, type EventType, type LotStatus } from '../../services/lotsService'
import { api } from '../../services/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<LotStatus, { bg: string; border: string; text: string; label: string; dot: string }> = {
  green:  { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Bien',    dot: '#22c55e' },
  yellow: { bg: '#fefce8', border: '#fde047', text: '#a16207', label: 'Regular', dot: '#eab308' },
  red:    { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', label: 'Alerta',  dot: '#ef4444' },
}

const EVENT_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  sowing:      { label: 'Siembra',     color: '#16a34a', bg: '#f0fdf4' },
  transplant:  { label: 'Trasplante',  color: '#2563eb', bg: '#eff6ff' },
  application: { label: 'Aplicación',  color: '#9333ea', bg: '#faf5ff' },
  harvest:     { label: 'Cosecha',     color: '#b45309', bg: '#fffbeb' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Weather forecast via Open-Meteo (free, no API key) ───────────────────────
// Fetched from the frontend directly — CORS is supported by Open-Meteo.

interface ForecastDay {
  date:       string
  tmax:       number
  tmin:       number
  precip:     number
  weathercode: number
}

function weatherIcon(code: number): string {
  if (code === 0)               return '☀️'
  if (code <= 2)                return '⛅'
  if (code <= 3)                return '☁️'
  if (code <= 49)               return '🌫️'
  if (code <= 59)               return '🌦️'
  if (code <= 69)               return '🌧️'
  if (code <= 79)               return '🌨️'
  if (code <= 84)               return '🌧️'
  if (code <= 99)               return '⛈️'
  return '🌡️'
}

function WeatherForecast({ lat, lon }: { lat: number; lon: number }) {
  const { data, isLoading, isError } = useQuery<ForecastDay[]>({
    queryKey: ['weather', lat, lon],
    queryFn: async () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
        `&timezone=auto&forecast_days=7`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Weather fetch failed')
      const json = await res.json()
      return json.daily.time.map((date: string, i: number) => ({
        date,
        tmax:        json.daily.temperature_2m_max[i],
        tmin:        json.daily.temperature_2m_min[i],
        precip:      json.daily.precipitation_sum[i],
        weathercode: json.daily.weathercode[i],
      }))
    },
    staleTime: 30 * 60 * 1000,  // 30 min — forecast doesn't change that often
  })

  if (isLoading) return <div style={{ fontSize: 13, color: 'var(--p-text-muted)', padding: '12px 0' }}>Cargando pronóstico...</div>
  if (isError || !data)   return <div style={{ fontSize: 13, color: '#b91c1c' }}>No se pudo cargar el pronóstico.</div>

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {data.map((day, i) => (
        <div key={day.date} style={{
          minWidth: 80, textAlign: 'center', padding: '10px 8px',
          borderRadius: 10, border: '1px solid var(--p-border)',
          background: i === 0 ? 'var(--p-primary-light, #f0fdf4)' : 'var(--p-surface)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, color: 'var(--p-text-muted)', fontWeight: 600 }}>
            {i === 0 ? 'Hoy' : new Date(day.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short' })}
          </div>
          <div style={{ fontSize: 22, margin: '4px 0' }}>{weatherIcon(day.weathercode)}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{Math.round(day.tmax)}°</div>
          <div style={{ fontSize: 12, color: '#3b82f6' }}>{Math.round(day.tmin)}°</div>
          {day.precip > 0 && (
            <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 2 }}>{day.precip.toFixed(1)} mm</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Add event modal ───────────────────────────────────────────────────────────

function AddEventModal({ lotId, onClose, onSaved }: {
  lotId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [eventType,   setEventType]   = useState<EventType>('transplant')
  const [occurredAt,  setOccurredAt]  = useState(toDatetimeLocal(new Date()))
  const [notes,       setNotes]       = useState('')
  const [product,     setProduct]     = useState('')
  const [dose,        setDose]        = useState('')
  const [unit,        setUnit]        = useState('cc/L')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload: Parameters<typeof createLotEvent>[1] = {
        event_type:  eventType,
        occurred_at: new Date(occurredAt).toISOString(),
        notes:       notes.trim() || undefined,
      }
      if (eventType === 'application' && product.trim()) {
        payload.data = { product: product.trim(), dose: dose.trim(), unit }
      }
      await createLotEvent(lotId, payload)
      onSaved()
    } catch {
      setError('No se pudo guardar el evento.')
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7, border: '1px solid var(--p-border)',
    fontSize: 14, color: 'var(--p-text)', background: 'var(--p-bg)', outline: 'none', width: '100%',
  }
  const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 4,
    fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--p-surface)', borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Registrar evento</h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <label style={labelStyle}>
            Tipo de evento
            <select value={eventType} onChange={e => setEventType(e.target.value as EventType)} style={inputStyle}>
              {(Object.entries(EVENT_CONFIG) as [EventType, typeof EVENT_CONFIG[EventType]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Fecha y hora
            <input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} style={inputStyle} />
          </label>

          {/* Application-specific fields */}
          {eventType === 'application' && (
            <>
              <label style={labelStyle}>
                Producto
                <input value={product} onChange={e => setProduct(e.target.value)} placeholder="Ej: Confidor" style={inputStyle} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ ...labelStyle, flex: 1 }}>
                  Dosis
                  <input value={dose} onChange={e => setDose(e.target.value)} placeholder="Ej: 2.5" style={inputStyle} />
                </label>
                <label style={{ ...labelStyle, width: 100 }}>
                  Unidad
                  <select value={unit} onChange={e => setUnit(e.target.value)} style={inputStyle}>
                    {['cc/L', 'g/L', 'cc/ha', 'g/ha', 'L/ha', 'kg/ha'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          <label style={labelStyle}>
            Notas
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observaciones opcionales..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </label>

          {error && (
            <div style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--p-border)',
              background: 'var(--p-bg)', color: 'var(--p-text-secondary)', fontSize: 14, cursor: 'pointer',
            }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--p-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function LotDetailModule() {
  const { lotId }   = useParams<{ lotId: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const [showAddEvent, setShowAddEvent] = useState(false)

  const { data: lot, isLoading, isError } = useQuery({
    queryKey: ['lot', lotId],
    queryFn:  () => getLotDetail(lotId!),
    enabled:  !!lotId,
  })

  // Fetch site coords for weather (stored on the lot's site via the sites table)
  // We re-use the sites query if already cached, otherwise the weather component won't render
  const { data: sites } = useQuery<{ latitude: number; longitude: number }[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/sites')
      return data
    },
    staleTime: 10 * 60 * 1000,
  })
  // Pick coords from the first site (user is scoped to one site at a time)
  const siteCoords = sites?.[0]

  async function handleStatusChange(status: LotStatus) {
    if (!lot) return
    await patchLot(lot.id, { status })
    queryClient.invalidateQueries({ queryKey: ['lot', lotId] })
  }

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--p-text-muted)' }}>Cargando lote...</div>
  if (isError || !lot) return <div style={{ padding: 40, color: '#b91c1c' }}>No se pudo cargar el lote.</div>

  const cfg = STATUS_CONFIG[lot.status]

  return (
    <div style={{ padding: '20px 20px 40px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/dashboard/lots')} style={{
          background: 'none', border: '1px solid var(--p-border)', borderRadius: 8,
          padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: 'var(--p-text-secondary)',
        }}>← Volver</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--p-text)', flex: 1 }}>
          {lot.name}
          {lot.crop_type && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--p-text-muted)', marginLeft: 8 }}>{lot.crop_type}</span>}
        </h2>
        {/* Status badge — click cycles */}
        <button onClick={() => {
          const next: LotStatus = lot.status === 'green' ? 'yellow' : lot.status === 'yellow' ? 'red' : 'green'
          handleStatusChange(next)
        }} style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
          padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
          border: `1px solid ${cfg.border}`, background: cfg.bg, color: cfg.text,
        }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
          {cfg.label}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Accumulators + nodes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {/* Degree-days */}
          <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginBottom: 4 }}>Grados día acumulados</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-text)' }}>
              {lot.accumulators.degree_days != null ? Math.round(lot.accumulators.degree_days) : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>desde último trasplante · base 10°C</div>
          </div>

          {/* Area */}
          {lot.area_ha != null && (
            <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginBottom: 4 }}>Superficie</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-text)' }}>{lot.area_ha}</div>
              <div style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>hectáreas</div>
            </div>
          )}

          {/* Nodes */}
          {lot.nodes.length > 0 && (
            <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginBottom: 8 }}>Nodos asignados</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {lot.nodes.map(n => (
                  <button key={n.device_uuid}
                    onClick={() => navigate(`/dashboard/telemetry/${n.device_id}`)}
                    style={{
                      textAlign: 'left', background: 'none', border: '1px solid var(--p-border)',
                      borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                      fontSize: 13, color: 'var(--p-primary)', fontWeight: 500,
                    }}>
                    {n.display_name || n.device_id} →
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Weather forecast */}
        {siteCoords && (
          <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)', marginBottom: 12 }}>Pronóstico 7 días</div>
            <WeatherForecast lat={siteCoords.latitude} lon={siteCoords.longitude} />
          </div>
        )}

        {/* Event history */}
        <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)' }}>Historial de eventos</div>
            <button onClick={() => setShowAddEvent(true)} style={{
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: 'var(--p-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>+ Registrar</button>
          </div>

          {lot.events.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--p-text-muted)', padding: '16px 0', textAlign: 'center' }}>
              Sin eventos registrados.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {lot.events.map(ev => {
                const ecfg = EVENT_CONFIG[ev.event_type]
                const appData = ev.data as { product?: string; dose?: string; unit?: string } | null
                return (
                  <div key={ev.id} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '10px 0', borderBottom: '1px solid var(--p-border-light)',
                  }}>
                    {/* Color dot */}
                    <div style={{
                      marginTop: 3, width: 10, height: 10, borderRadius: '50%',
                      background: ecfg.color, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                          background: ecfg.bg, color: ecfg.color,
                        }}>{ecfg.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--p-text-muted)' }}>{formatDate(ev.occurred_at)}</span>
                      </div>
                      {appData?.product && (
                        <div style={{ fontSize: 13, color: 'var(--p-text-secondary)', marginTop: 3 }}>
                          {appData.product}{appData.dose ? ` · ${appData.dose} ${appData.unit ?? ''}` : ''}
                        </div>
                      )}
                      {ev.notes && (
                        <div style={{ fontSize: 13, color: 'var(--p-text-muted)', marginTop: 2 }}>{ev.notes}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {showAddEvent && (
        <AddEventModal
          lotId={lot.id}
          onClose={() => setShowAddEvent(false)}
          onSaved={() => {
            setShowAddEvent(false)
            queryClient.invalidateQueries({ queryKey: ['lot', lotId] })
          }}
        />
      )}
    </div>
  )
}
