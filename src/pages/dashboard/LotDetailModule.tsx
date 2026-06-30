import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getLotDetail, patchLot, type LotEvent, type LotStatus, type MonitoringSummary } from '../../services/lotsService'
import { getLotCycles, createCycle, getCropTypes, type Cycle, type CreateCyclePayload } from '../../services/cyclesService'
import { api } from '../../services/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<LotStatus, { bg: string; border: string; text: string; label: string; dot: string }> = {
  green:  { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Bien',    dot: '#22c55e' },
  yellow: { bg: '#fefce8', border: '#fde047', text: '#a16207', label: 'Regular', dot: '#eab308' },
  red:    { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', label: 'Alerta',  dot: '#ef4444' },
}

const EVENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  sowing:      { label: 'Siembra',     color: '#16a34a', bg: '#f0fdf4' },
  transplant:  { label: 'Trasplante',  color: '#2563eb', bg: '#eff6ff' },
  application: { label: 'Aplicación',  color: '#9333ea', bg: '#faf5ff' },
  harvest:     { label: 'Cosecha',     color: '#b45309', bg: '#fffbeb' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateShort(ymd: string): string {
  // Slice to 10 chars to handle both YYYY-MM-DD and ISO timestamp strings from pg
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function todayYMD(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

// ── Weather forecast via Open-Meteo ──────────────────────────────────────────

interface ForecastDay {
  date:        string
  tmax:        number
  tmin:        number
  precip:      number
  weathercode: number
}

function weatherIcon(code: number): string {
  if (code === 0)  return '☀️'
  if (code <= 2)   return '⛅'
  if (code <= 3)   return '☁️'
  if (code <= 49)  return '🌫️'
  if (code <= 59)  return '🌦️'
  if (code <= 69)  return '🌧️'
  if (code <= 79)  return '🌨️'
  if (code <= 84)  return '🌧️'
  if (code <= 99)  return '⛈️'
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
    staleTime: 30 * 60 * 1000,
  })

  if (isLoading) return <div style={{ fontSize: 13, color: 'var(--p-text-muted)', padding: '12px 0' }}>Cargando pronóstico...</div>
  if (isError || !data) return <div style={{ fontSize: 13, color: '#b91c1c' }}>No se pudo cargar el pronóstico.</div>

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

// ── Add Cycle Modal ───────────────────────────────────────────────────────────

function AddCycleModal({ lotId, onClose, onSaved }: {
  lotId:   string
  onClose: () => void
  onSaved: () => void
}) {
  const { data: cropTypes = [] } = useQuery({
    queryKey: ['cropTypes'],
    queryFn:  getCropTypes,
    staleTime: 60 * 60 * 1000, // these change rarely
  })

  const currentYear = new Date().getFullYear()

  const [cropType,   setCropType]   = useState('')
  const [customCrop, setCustomCrop] = useState('')
  const [name,       setName]       = useState('')
  const [startedAt,  setStartedAt]  = useState(todayYMD())
  const [freqDays,   setFreqDays]   = useState(7)
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Auto-fill name when selecting a known crop
  function handleCropChange(value: string) {
    setCropType(value)
    if (value && value !== '__otros__') {
      setName(`${value} ${currentYear}`)
    } else if (value === '__otros__') {
      setName('')
    }
  }

  // When typing a custom crop, update the name suggestion too
  function handleCustomCropChange(value: string) {
    setCustomCrop(value)
    setName(value ? `${value} ${currentYear}` : '')
  }

  const effectiveCropType = cropType === '__otros__' ? customCrop.trim() : cropType

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!effectiveCropType) { setError('Seleccioná un cultivo.'); return }
    if (!name.trim())        { setError('El nombre es obligatorio.'); return }

    setSaving(true)
    setError(null)
    try {
      const payload: CreateCyclePayload = {
        name:       name.trim(),
        crop_type:  effectiveCropType,
        started_at: startedAt,
        monitoring_frequency_days: freqDays,
        notes:      notes.trim() || undefined,
      }
      await createCycle(lotId, payload)
      onSaved()
    } catch {
      setError('No se pudo guardar el ciclo.')
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 7, border: '1px solid var(--p-border)',
    fontSize: 14, color: 'var(--p-text)', background: 'var(--p-bg)', width: '100%',
  }
  const lbl: React.CSSProperties = {
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
        width: '100%', maxWidth: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Nuevo ciclo productivo</h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <label style={lbl}>
            Cultivo *
            <select value={cropType} onChange={e => handleCropChange(e.target.value)} style={inp} required>
              <option value="">Seleccioná un cultivo...</option>
              {cropTypes.map(ct => (
                <option key={ct.crop_type} value={ct.crop_type}>{ct.crop_type}</option>
              ))}
              <option value="__otros__">Otros...</option>
            </select>
          </label>

          {cropType === '__otros__' && (
            <label style={lbl}>
              Nombre del cultivo *
              <input
                value={customCrop}
                onChange={e => handleCustomCropChange(e.target.value)}
                placeholder="Ej: Albahaca, Radicheta..."
                style={inp}
                required
              />
            </label>
          )}

          <label style={lbl}>
            Nombre del ciclo *
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`Ej: Tomate ${currentYear}`}
              style={inp}
              required
            />
          </label>

          <label style={lbl}>
            Fecha de inicio (siembra o trasplante) *
            <input type="date" value={startedAt} onChange={e => setStartedAt(e.target.value)} style={inp} required />
          </label>

          <label style={lbl}>
            Frecuencia de monitoreo (días)
            <input
              type="number" min={1} max={90} value={freqDays}
              onChange={e => setFreqDays(Number(e.target.value))}
              style={inp}
            />
          </label>

          <label style={lbl}>
            Notas
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observaciones opcionales..."
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>

          {error && (
            <div style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--p-border)',
              background: 'var(--p-bg)', color: 'var(--p-text-secondary)', fontSize: 14, cursor: 'pointer',
            }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--p-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>{saving ? 'Guardando...' : 'Guardar ciclo'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Lot timeline — read-only history grouped by cycle ────────────────────────

function LotTimeline({ events, monitoringSummaries }: { events: LotEvent[]; monitoringSummaries: MonitoringSummary[] }) {
  if (events.length === 0 && monitoringSummaries.length === 0) {
    return (
      <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)', marginBottom: 12 }}>Historial</div>
        <div style={{ fontSize: 13, color: 'var(--p-text-muted)', padding: '12px 0', textAlign: 'center' }}>
          Sin historial registrado. Los eventos y monitoreos se cargan desde el ciclo.
        </div>
      </div>
    )
  }

  // Build a unified list of timeline entries, each tagged with its cycle
  type TimelineEntry =
    | { kind: 'event'; date: string; cycleId: string | null; cycleName: string | null; cropType: string | null; event: LotEvent }
    | { kind: 'monitoring'; date: string; cycleId: string; cycleName: string; cropType: string; count: number }

  const entries: TimelineEntry[] = [
    ...events.map(ev => ({
      kind:      'event' as const,
      date:      String(ev.occurred_at).slice(0, 10),
      cycleId:   ev.cycle_id,
      cycleName: ev.cycle_name,
      cropType:  ev.cycle_crop_type,
      event:     ev,
    })),
    ...monitoringSummaries.map(ms => ({
      kind:      'monitoring' as const,
      date:      String(ms.monitored_at).slice(0, 10),
      cycleId:   ms.cycle_id,
      cycleName: ms.cycle_name,
      cropType:  ms.cycle_crop_type,
      count:     Number(ms.count),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)) // most recent first

  // Group by cycle (most recent cycle first since entries are sorted DESC)
  const groups: { cycleId: string | null; cycleName: string | null; cropType: string | null; entries: TimelineEntry[] }[] = []
  const seen = new Map<string, number>()

  for (const entry of entries) {
    const key = entry.cycleId ?? '__none__'
    if (!seen.has(key)) {
      seen.set(key, groups.length)
      groups.push({ cycleId: entry.cycleId, cycleName: entry.cycleName, cropType: entry.cropType, entries: [] })
    }
    groups[seen.get(key)!].entries.push(entry)
  }

  return (
    <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)', marginBottom: 16 }}>Historial</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map(group => (
          <div key={group.cycleId ?? '__none__'}>
            {/* Cycle header */}
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--p-text-muted)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              borderBottom: '1px solid var(--p-border)', paddingBottom: 6, marginBottom: 10,
            }}>
              {group.cycleName
                ? `${group.cycleName}${group.cropType ? ` · ${group.cropType}` : ''}`
                : 'Sin ciclo asignado'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.entries.map((entry, i) => {
                if (entry.kind === 'monitoring') {
                  return (
                    <div key={`mon-${entry.date}-${i}`} style={{
                      display: 'flex', gap: 10, alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid var(--p-border-light)',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: '#0ea5e9', flexShrink: 0 }} />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', flex: 1 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                          background: '#f0f9ff', color: '#0284c7',
                        }}>Monitoreo</span>
                        <span style={{ fontSize: 12, color: 'var(--p-text-muted)' }}>
                          {formatDateShort(entry.date)}
                        </span>
                        {entry.count > 1 && (
                          <span style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>
                            {entry.count} plantas
                          </span>
                        )}
                      </div>
                    </div>
                  )
                }

                const ecfg = EVENT_CONFIG[entry.event.event_type] ?? { label: entry.event.event_type, color: '#6b7280', bg: '#f9fafb' }
                const appData = entry.event.data as { product?: string; dose?: string; unit?: string } | null
                return (
                  <div key={entry.event.id} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '8px 0', borderBottom: '1px solid var(--p-border-light)',
                  }}>
                    <div style={{ marginTop: 3, width: 8, height: 8, borderRadius: '50%', background: ecfg.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                          background: ecfg.bg, color: ecfg.color,
                        }}>{ecfg.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--p-text-muted)' }}>
                          {new Date(entry.event.occurred_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {appData?.product && (
                        <div style={{ fontSize: 12, color: 'var(--p-text-secondary)', marginTop: 2 }}>
                          {appData.product}{appData.dose ? ` · ${appData.dose} ${appData.unit ?? ''}` : ''}
                        </div>
                      )}
                      {entry.event.notes && (
                        <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginTop: 1 }}>{entry.event.notes}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Cycle row ─────────────────────────────────────────────────────────────────

function CycleRow({ cycle }: { cycle: Cycle }) {
  const navigate = useNavigate()
  const isActive = cycle.ended_at === null
  const isOverdue = isActive &&
    cycle.days_without_monitoring !== null &&
    cycle.days_without_monitoring > cycle.monitoring_frequency_days

  return (
    <div
      onClick={() => navigate(`/dashboard/cycles/${cycle.id}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
        borderBottom: '1px solid var(--p-border-light)', cursor: 'pointer',
      }}
    >
      {/* Active / closed indicator */}
      <div style={{
        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
        background: isActive ? '#22c55e' : '#94a3b8',
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-text)' }}>{cycle.name}</div>
        <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginTop: 2 }}>
          {formatDateShort(cycle.started_at)}
          {cycle.ended_at ? ` → ${formatDateShort(cycle.ended_at)}` : ' → activo'}
        </div>
      </div>

      {/* Monitoring alert badge */}
      {isOverdue && (
        <div style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
          background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', flexShrink: 0,
        }}>
          {cycle.days_without_monitoring}d sin monitoreo
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--p-text-muted)', flexShrink: 0 }}>→</div>
    </div>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function LotDetailModule() {
  const { lotId }   = useParams<{ lotId: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const [showAddCycle, setShowAddCycle] = useState(false)

  const { data: lot, isLoading, isError } = useQuery({
    queryKey: ['lot', lotId],
    queryFn:  () => getLotDetail(lotId!),
    enabled:  !!lotId,
  })

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles', lotId],
    queryFn:  () => getLotCycles(lotId!),
    enabled:  !!lotId,
  })

  const { data: sites } = useQuery<{ latitude: number; longitude: number }[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/sites')
      return data
    },
    staleTime: 10 * 60 * 1000,
  })
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
        </h2>
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

        {/* Lot info cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {lot.area_ha != null && (
            <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginBottom: 4 }}>Superficie</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-text)' }}>{lot.area_ha}</div>
              <div style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>hectáreas</div>
            </div>
          )}

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

        {/* Cycles */}
        <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)' }}>Ciclos productivos</div>
            <button onClick={() => setShowAddCycle(true)} style={{
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: 'var(--p-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>+ Nuevo ciclo</button>
          </div>

          {cycles.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--p-text-muted)', padding: '16px 0', textAlign: 'center' }}>
              Sin ciclos registrados. Creá uno para empezar a monitorear.
            </div>
          ) : (
            <div>
              {cycles.map(cycle => (
                <CycleRow key={cycle.id} cycle={cycle} />
              ))}
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

        {/* Event timeline — read-only, grouped by cycle */}
        <LotTimeline events={lot.events} monitoringSummaries={lot.monitoring_summaries} />

      </div>

      {showAddCycle && (
        <AddCycleModal
          lotId={lot.id}
          onClose={() => setShowAddCycle(false)}
          onSaved={() => {
            setShowAddCycle(false)
            queryClient.invalidateQueries({ queryKey: ['cycles', lotId] })
          }}
        />
      )}

    </div>
  )
}
