import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCycle,
  getCycleMonitorings,
  getCycleEvents,
  getMonitoringItems,
  getPesticideProducts,
  createMonitoring,
  createCycleEvent,
  type Monitoring,
  type MonitoringItem,
  type CycleEvent,
  type EventType,
  type ApplicationProduct,
  type PesticideProduct,
} from '../../services/cyclesService'

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

function daysFromToday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

// Determine if a score exceeds the threshold for a given item.
// Special case: trips_ninfas_pct with ddt <= 40 fires at any value > 0.
function isOverThreshold(item: MonitoringItem, value: number | boolean, ddt: number): boolean {
  if (item.scale_type === 'boolean') return value === true
  if (item.threshold_value === null) return false
  const effectiveThreshold =
    item.item_key === 'trips_ninfas_pct' && ddt <= 40 ? 0 : item.threshold_value
  return (value as number) > effectiveThreshold
}

const EVENT_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  sowing:      { label: 'Siembra',     color: '#16a34a', bg: '#f0fdf4' },
  transplant:  { label: 'Trasplante',  color: '#2563eb', bg: '#eff6ff' },
  application: { label: 'Aplicación',  color: '#9333ea', bg: '#faf5ff' },
  harvest:     { label: 'Cosecha',     color: '#b45309', bg: '#fffbeb' },
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Add Event Modal ───────────────────────────────────────────────────────────

const DOSE_UNITS = ['cc/L', 'g/L', 'mL/100L', 'g/100L', 'cc/ha', 'g/ha', 'L/ha', 'kg/ha']

// Empty product row for new entries
function emptyProduct(): ApplicationProduct {
  return { commercial_name: '', active_ingredient: '', dose: undefined, dose_unit: 'cc/L' }
}

function AddEventModal({ cycleId, onClose, onSaved }: {
  cycleId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [eventType,  setEventType]  = useState<EventType>('transplant')
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocal(new Date()))
  const [notes,      setNotes]      = useState('')
  // Multi-product rows for application events
  const [products,   setProducts]   = useState<ApplicationProduct[]>([emptyProduct()])
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Load catalog for autocomplete (no org scope needed)
  const { data: catalog = [] } = useQuery<PesticideProduct[]>({
    queryKey: ['pesticideProducts'],
    queryFn:  getPesticideProducts,
    staleTime: 5 * 60 * 1000,
  })

  // When the user picks a known product from the datalist, auto-fill active_ingredient and dose_unit
  function handleProductNameChange(idx: number, name: string) {
    const match = catalog.find(p => p.commercial_name.toLowerCase() === name.toLowerCase())
    setProducts(prev => prev.map((row, i) => {
      if (i !== idx) return row
      return {
        ...row,
        commercial_name:   name,
        active_ingredient: match ? match.active_ingredient : row.active_ingredient,
        dose_unit:         match?.dose_unit ?? row.dose_unit ?? 'cc/L',
        // Pre-fill dose only if field is empty
        dose: (row.dose === undefined && match?.default_dose != null) ? match.default_dose : row.dose,
      }
    }))
  }

  function handleProductField(idx: number, field: keyof ApplicationProduct, value: string | number | undefined) {
    setProducts(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }

  function addProductRow() {
    setProducts(prev => [...prev, emptyProduct()])
  }

  function removeProductRow(idx: number) {
    setProducts(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload: Parameters<typeof createCycleEvent>[1] = {
        event_type:  eventType,
        occurred_at: new Date(occurredAt).toISOString(),
        notes:       notes.trim() || undefined,
      }
      if (eventType === 'application') {
        // Filter out rows without a product name
        const filled = products
          .filter(p => p.commercial_name.trim())
          .map(p => ({
            commercial_name:   p.commercial_name.trim(),
            active_ingredient: p.active_ingredient?.trim() || undefined,
            dose:              p.dose,
            dose_unit:         p.dose_unit || undefined,
          }))
        if (filled.length > 0) payload.data = { products: filled }
      }
      await createCycleEvent(cycleId, payload)
      onSaved()
    } catch {
      setError('No se pudo guardar el evento.')
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7, border: '1px solid var(--p-border)',
    fontSize: 14, color: 'var(--p-text)', background: 'var(--p-bg)', width: '100%',
  }
  const lbl: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 4,
    fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 16, overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--p-surface)', borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 520, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        margin: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Registrar evento</h3>

        {/* Datalist for autocomplete — invisible, referenced by product inputs */}
        <datalist id="pesticide-catalog">
          {catalog.map(p => (
            <option key={p.id} value={p.commercial_name}>{p.active_ingredient}</option>
          ))}
        </datalist>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={lbl}>
            Tipo de evento
            <select value={eventType} onChange={e => setEventType(e.target.value as EventType)} style={inp}>
              {(Object.entries(EVENT_CONFIG) as [EventType, typeof EVENT_CONFIG[EventType]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>

          <label style={lbl}>
            Fecha y hora
            <input
              type="datetime-local"
              value={occurredAt}
              max={toDatetimeLocal(new Date())}
              onChange={e => setOccurredAt(e.target.value)}
              style={inp}
            />
          </label>

          {/* ── Application products table ── */}
          {eventType === 'application' && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)', marginBottom: 8 }}>
                Productos aplicados
              </div>

              {/* Column headers */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 160px 80px 80px 28px',
                gap: 6, marginBottom: 4,
              }}>
                {['Producto', 'Ppio. activo', 'Dosis', 'Unidad', ''].map((h, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--p-text-muted)', fontWeight: 600 }}>{h}</div>
                ))}
              </div>

              {/* Product rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {products.map((row, idx) => (
                  <div key={idx} style={{
                    display: 'grid', gridTemplateColumns: '1fr 160px 80px 80px 28px', gap: 6, alignItems: 'center',
                  }}>
                    {/* Product name — with autocomplete from catalog */}
                    <input
                      list="pesticide-catalog"
                      value={row.commercial_name}
                      onChange={e => handleProductNameChange(idx, e.target.value)}
                      placeholder="Producto..."
                      style={inp}
                    />
                    {/* Active ingredient — auto-filled from catalog, editable */}
                    <input
                      value={row.active_ingredient ?? ''}
                      onChange={e => handleProductField(idx, 'active_ingredient', e.target.value)}
                      placeholder="Ppio. activo"
                      style={inp}
                    />
                    {/* Dose number */}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.dose ?? ''}
                      onChange={e => handleProductField(idx, 'dose', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                      style={inp}
                    />
                    {/* Dose unit */}
                    <select
                      value={row.dose_unit ?? 'cc/L'}
                      onChange={e => handleProductField(idx, 'dose_unit', e.target.value)}
                      style={inp}
                    >
                      {DOSE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {/* Remove row button (only if more than one row) */}
                    {products.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeProductRow(idx)}
                        style={{
                          width: 24, height: 24, borderRadius: 6, border: '1px solid var(--p-border)',
                          background: 'var(--p-bg)', color: 'var(--p-text-muted)',
                          fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0,
                        }}
                      >×</button>
                    ) : <div />}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addProductRow}
                style={{
                  marginTop: 8, padding: '5px 12px', borderRadius: 7,
                  border: '1px dashed var(--p-border)', background: 'transparent',
                  color: 'var(--p-text-muted)', fontSize: 13, cursor: 'pointer',
                }}
              >+ Agregar producto</button>
            </div>
          )}

          <label style={lbl}>
            Notas
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observaciones opcionales..."
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
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

const CATEGORY_LABELS: Record<string, string> = {
  pest:    'Plagas',
  disease: 'Enfermedades',
  metric:  'Cultivo',
}

// ── Score input controls ──────────────────────────────────────────────────────

interface ScoreInputProps {
  item:     MonitoringItem
  value:    number | boolean
  onChange: (v: number | boolean) => void
  isOver:   boolean
}

function ScoreInput({ item, value, onChange, isOver }: ScoreInputProps) {
  const accentColor = isOver ? '#ef4444' : 'var(--p-primary)'

  if (item.scale_type === 'boolean') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onChange(false)} style={{
          flex: 1, height: 48, borderRadius: 10, border: '2px solid',
          borderColor: value === false ? '#22c55e' : 'var(--p-border)',
          background: value === false ? '#f0fdf4' : 'var(--p-bg)',
          color: value === false ? '#15803d' : 'var(--p-text-muted)',
          fontWeight: 700, fontSize: 15, cursor: 'pointer',
        }}>Sin síntomas</button>
        <button type="button" onClick={() => onChange(true)} style={{
          flex: 1, height: 48, borderRadius: 10, border: '2px solid',
          borderColor: value === true ? '#ef4444' : 'var(--p-border)',
          background: value === true ? '#fef2f2' : 'var(--p-bg)',
          color: value === true ? '#b91c1c' : 'var(--p-text-muted)',
          fontWeight: 700, fontSize: 15, cursor: 'pointer',
        }}>Con síntomas</button>
      </div>
    )
  }

  if (item.scale_type === 'scale_0_5') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2, 3, 4, 5].map(v => {
          const isSelected = value === v
          const isThisOver = item.threshold_value !== null && v > item.threshold_value
          return (
            <button key={v} type="button" onClick={() => onChange(v)} style={{
              flex: 1, height: 48, borderRadius: 10, border: '2px solid',
              borderColor: isSelected ? (isThisOver ? '#ef4444' : accentColor) : 'var(--p-border)',
              background: isSelected ? (isThisOver ? '#fef2f2' : '#eff6ff') : 'var(--p-bg)',
              color: isSelected ? (isThisOver ? '#b91c1c' : '#1d4ed8') : 'var(--p-text-muted)',
              fontWeight: 700, fontSize: 17, cursor: 'pointer',
            }}>{v}</button>
          )
        })}
      </div>
    )
  }

  // count or percent — +/- controls
  const numVal = value as number
  const max = item.scale_type === 'percent' ? 100 : 999

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button type="button" onClick={() => onChange(Math.max(0, numVal - 1))} style={{
        width: 48, height: 48, borderRadius: 10, border: '1px solid var(--p-border)',
        background: 'var(--p-bg)', fontSize: 22, fontWeight: 700,
        color: 'var(--p-text)', cursor: 'pointer',
      }}>−</button>
      <div style={{
        minWidth: 60, textAlign: 'center', fontSize: 24, fontWeight: 700,
        color: isOver ? '#ef4444' : 'var(--p-text)',
      }}>
        {numVal}{item.scale_type === 'percent' ? '%' : ''}
      </div>
      <button type="button" onClick={() => onChange(Math.min(max, numVal + 1))} style={{
        width: 48, height: 48, borderRadius: 10, border: '1px solid var(--p-border)',
        background: 'var(--p-bg)', fontSize: 22, fontWeight: 700,
        color: 'var(--p-text)', cursor: 'pointer',
      }}>+</button>
    </div>
  )
}

// ── Monitoring form modal ─────────────────────────────────────────────────────

function MonitoringFormModal({ cycleId, cycleStartedAt, onClose, onSaved }: {
  cycleId:        string
  cycleStartedAt: string
  onClose:        () => void
  onSaved:        (lotStatus: string) => void
}) {
  const { data: itemsData } = useQuery({
    queryKey: ['monitoringItems', cycleId],
    queryFn:  () => getMonitoringItems(cycleId),
  })

  const items = itemsData?.items ?? []

  const [monitoredAt,  setMonitoredAt]  = useState(todayYMD())
  const [plantLabel,   setPlantLabel]   = useState('')
  const [scores,       setScores]       = useState<Record<string, number | boolean>>({})
  const [fociText,     setFociText]     = useState<Record<string, string>>({})
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Days from transplant at the selected monitoring date
  const ddt = useMemo(() => {
    const [sy, sm, sd] = cycleStartedAt.split('-').map(Number)
    const [my, mm, md] = monitoredAt.split('-').map(Number)
    const start = new Date(sy, sm - 1, sd)
    const end   = new Date(my, mm - 1, md)
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }, [cycleStartedAt, monitoredAt])

  // Initialize scores to 0 / false for all items when they load
  const initializedItems = useMemo(() => {
    const init: Record<string, number | boolean> = {}
    for (const item of items) {
      init[item.item_key] = item.scale_type === 'boolean' ? false : 0
    }
    return init
  }, [items])

  function getScore(key: string): number | boolean {
    return key in scores ? scores[key] : initializedItems[key] ?? 0
  }

  function setScore(key: string, value: number | boolean) {
    setScores(prev => ({ ...prev, [key]: value }))
  }

  // Items over threshold (to show foci section)
  const overThresholdItems = items.filter(item => {
    const val = getScore(item.item_key)
    return isOverThreshold(item, val, ddt)
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Build final scores (use initialized defaults for untouched items)
      const finalScores: Record<string, number | boolean> = { ...initializedItems, ...scores }

      // Build foci from over-threshold items that have location text
      const foci = overThresholdItems
        .map(item => ({ item_key: item.item_key, location_text: fociText[item.item_key]?.trim() }))
        .filter(f => f.location_text)

      const result = await createMonitoring(cycleId, {
        monitored_at: monitoredAt,
        plant_label:  plantLabel.trim() || undefined,
        scores:       finalScores,
        notes:        notes.trim() || undefined,
        foci,
      })
      onSaved(result.lot_status)
    } catch {
      setError('No se pudo guardar el monitoreo.')
      setSaving(false)
    }
  }

  const grouped = useMemo(() => {
    const groups: Record<string, MonitoringItem[]> = { pest: [], disease: [], metric: [] }
    for (const item of items) {
      groups[item.category]?.push(item)
    }
    return groups
  }, [items])

  if (items.length === 0) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }} onClick={onClose}>
        <div style={{
          background: 'var(--p-surface)', borderRadius: 12, padding: 32,
          textAlign: 'center', color: 'var(--p-text-muted)',
        }} onClick={e => e.stopPropagation()}>
          Cargando ítems de monitoreo...
        </div>
      </div>
    )
  }

  const inp: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 7, border: '1px solid var(--p-border)',
    fontSize: 14, color: 'var(--p-text)', background: 'var(--p-bg)', width: '100%',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 1000, overflowY: 'auto', padding: '16px 8px',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--p-surface)', borderRadius: 12, padding: '20px 20px 32px',
        width: '100%', maxWidth: 520, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nuevo monitoreo</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
            color: 'var(--p-text-muted)', padding: '0 4px',
          }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Date + plant */}
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)', flex: 1 }}>
              Fecha del relevamiento
              <input type="date" value={monitoredAt} onChange={e => setMonitoredAt(e.target.value)} style={inp} required />
              <span style={{ fontSize: 11, color: 'var(--p-text-muted)', fontWeight: 400 }}>
                {ddt >= 0 ? `${ddt} días desde trasplante` : 'Fecha anterior al inicio del ciclo'}
              </span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)', flex: 1 }}>
              Planta / Punto
              <input
                value={plantLabel}
                onChange={e => setPlantLabel(e.target.value)}
                placeholder="Ej: Planta 1, Lomo 3..."
                style={inp}
              />
              <span style={{ fontSize: 11, color: 'var(--p-text-muted)', fontWeight: 400 }}>opcional</span>
            </label>
          </div>

          {/* Items by category */}
          {(['pest', 'disease', 'metric'] as const).map(cat => {
            const catItems = grouped[cat]
            if (!catItems.length) return null
            return (
              <div key={cat}>
                {/* Category divider */}
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--p-text-muted)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  borderBottom: '1px solid var(--p-border)', paddingBottom: 6, marginBottom: 16,
                }}>
                  {CATEGORY_LABELS[cat]}
                  {cat === 'disease' && (
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
                      (0=sano · 1=&lt;10% · 2=&lt;25% · 3=&lt;50% · 4=&lt;75% · 5=&lt;100%)
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {catItems.map(item => {
                    const val  = getScore(item.item_key)
                    const over = isOverThreshold(item, val, ddt)
                    return (
                      <div key={item.item_key}>
                        {/* Item label + threshold */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600,
                            color: over ? '#b91c1c' : 'var(--p-text)',
                          }}>{item.label}</div>
                          {item.threshold_value !== null && (
                            <div style={{
                              fontSize: 11, color: over ? '#b91c1c' : 'var(--p-text-muted)',
                              fontWeight: over ? 700 : 400,
                            }}>
                              {over ? 'SOBRE UMBRAL · ' : ''}{item.threshold_notes}
                            </div>
                          )}
                        </div>
                        <ScoreInput
                          item={item}
                          value={val}
                          onChange={v => setScore(item.item_key, v)}
                          isOver={over}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Foci — only shown if at least one item is over threshold */}
          {overThresholdItems.length > 0 && (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#b45309',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                borderBottom: '1px solid #fde68a', paddingBottom: 6, marginBottom: 16,
              }}>
                Focos detectados (opcional — indicar ubicación)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {overThresholdItems.map(item => (
                  <label key={item.item_key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                    {item.label}
                    <input
                      value={fociText[item.item_key] ?? ''}
                      onChange={e => setFociText(prev => ({ ...prev, [item.item_key]: e.target.value }))}
                      placeholder="Ej: Zona norte, lomos 3 al 7"
                      style={inp}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)' }}>
            Notas generales
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observaciones opcionales..."
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>

          {error && (
            <div style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>
          )}

          <button type="submit" disabled={saving} style={{
            padding: '14px', borderRadius: 10, border: 'none',
            background: 'var(--p-primary)', color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>
            {saving ? 'Guardando...' : 'Guardar monitoreo'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Monitoring history card ───────────────────────────────────────────────────

function MonitoringCard({ monitoring, items }: { monitoring: Monitoring; items: MonitoringItem[] }) {
  const [expanded, setExpanded] = useState(false)

  // Items over threshold in this monitoring
  const overdItems = items.filter(item => {
    const val = monitoring.scores[item.item_key]
    if (val === undefined) return false
    return isOverThreshold(item, val, monitoring.days_from_transplant)
  })

  return (
    <div style={{
      border: `1px solid ${overdItems.length > 0 ? '#fca5a5' : 'var(--p-border)'}`,
      borderRadius: 10,
      background: overdItems.length > 0 ? '#fff8f8' : 'var(--p-surface)',
      overflow: 'hidden',
    }}>
      {/* Summary row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--p-text)' }}>
              Semana {monitoring.week_number}
              {monitoring.plant_label && (
                <span style={{ fontWeight: 500, color: 'var(--p-text-secondary)' }}> · {monitoring.plant_label}</span>
              )}
            </span>
            <span style={{ fontSize: 12, color: 'var(--p-text-muted)' }}>
              {formatDateShort(monitoring.monitored_at)} · ddt {monitoring.days_from_transplant}d
            </span>
          </div>
          {overdItems.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {overdItems.map(item => (
                <span key={item.item_key} style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 8,
                  background: '#fef2f2', color: '#b91c1c', fontWeight: 600,
                }}>{item.label}</span>
              ))}
            </div>
          )}
          {overdItems.length === 0 && (
            <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>Todo dentro de umbral</div>
          )}
        </div>
        <span style={{ fontSize: 18, color: 'var(--p-text-muted)' }}>{expanded ? '∧' : '∨'}</span>
      </div>

      {/* Detail — expanded */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--p-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, marginTop: 12 }}>
            {items.map(item => {
              const val = monitoring.scores[item.item_key]
              if (val === undefined) return null
              const over = isOverThreshold(item, val, monitoring.days_from_transplant)
              const displayVal = item.scale_type === 'boolean'
                ? (val ? 'Sí' : 'No')
                : item.scale_type === 'percent'
                  ? `${val}%`
                  : String(val)
              return (
                <div key={item.item_key} style={{
                  fontSize: 12, padding: '4px 8px', borderRadius: 6,
                  background: over ? '#fef2f2' : 'var(--p-bg)',
                  border: `1px solid ${over ? '#fca5a5' : 'var(--p-border)'}`,
                  color: over ? '#b91c1c' : 'var(--p-text-secondary)',
                }}>
                  <span style={{ fontWeight: 600 }}>{displayVal}</span> {item.label}
                </div>
              )
            })}
          </div>

          {monitoring.foci.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>FOCOS</div>
              {monitoring.foci.map(f => {
                const item = items.find(i => i.item_key === f.item_key)
                return (
                  <div key={f.id} style={{ fontSize: 12, color: '#92400e', marginBottom: 2 }}>
                    <strong>{item?.label ?? f.item_key}:</strong> {f.location_text}
                  </div>
                )
              })}
            </div>
          )}

          {monitoring.notes && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--p-text-muted)', fontStyle: 'italic' }}>
              {monitoring.notes}
            </div>
          )}

          {monitoring.created_by && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--p-text-muted)' }}>
              Registrado por: {monitoring.created_by}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function CycleDetailModule() {
  const { cycleId } = useParams<{ cycleId: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()

  const [showForm,     setShowForm]     = useState(false)
  const [showAddEvent, setShowAddEvent] = useState(false)

  const { data: cycle, isLoading, isError } = useQuery({
    queryKey: ['cycle', cycleId],
    queryFn:  () => getCycle(cycleId!),
    enabled:  !!cycleId,
  })

  const { data: monitorings = [] } = useQuery({
    queryKey: ['monitorings', cycleId],
    queryFn:  () => getCycleMonitorings(cycleId!),
    enabled:  !!cycleId,
  })

  const { data: events = [] } = useQuery<CycleEvent[]>({
    queryKey: ['cycleEvents', cycleId],
    queryFn:  () => getCycleEvents(cycleId!),
    enabled:  !!cycleId,
  })

  const { data: itemsData } = useQuery({
    queryKey: ['monitoringItems', cycleId],
    queryFn:  () => getMonitoringItems(cycleId!),
    enabled:  !!cycleId,
  })

  const items = itemsData?.items ?? []

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--p-text-muted)' }}>Cargando ciclo...</div>
  if (isError || !cycle) return <div style={{ padding: 40, color: '#b91c1c' }}>No se pudo cargar el ciclo.</div>

  const isActive  = cycle.ended_at === null
  const ddt       = daysFromToday(cycle.started_at)
  const isOverdue = isActive &&
    cycle.days_without_monitoring !== null &&
    cycle.days_without_monitoring > cycle.monitoring_frequency_days
  const isNearDue = isActive &&
    cycle.days_without_monitoring !== null &&
    !isOverdue &&
    cycle.days_without_monitoring >= cycle.monitoring_frequency_days * 0.7

  return (
    <div style={{ padding: '20px 20px 40px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => navigate(`/dashboard/lots/${cycle.lot_id}`)} style={{
          background: 'none', border: '1px solid var(--p-border)', borderRadius: 8,
          padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: 'var(--p-text-secondary)',
        }}>← Lote</button>

        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--p-text)' }}>{cycle.name}</h2>
          <div style={{ fontSize: 13, color: 'var(--p-text-muted)', marginTop: 2 }}>
            {cycle.crop_type} · {formatDateShort(cycle.started_at)}
            {cycle.ended_at ? ` → ${formatDateShort(cycle.ended_at)}` : ' → activo'}
          </div>
        </div>

        <div style={{
          fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
          background: isActive ? '#f0fdf4' : '#f1f5f9',
          color: isActive ? '#15803d' : '#64748b',
          border: `1px solid ${isActive ? '#86efac' : '#cbd5e1'}`,
        }}>
          {isActive ? 'Activo' : 'Cerrado'}
        </div>
      </div>

      {/* Monitoring alert banner */}
      {isOverdue && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c' }}>Monitoreo vencido</div>
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>
              Hace {cycle.days_without_monitoring} días sin monitorear · frecuencia esperada: {cycle.monitoring_frequency_days}d
            </div>
          </div>
          <button onClick={() => setShowForm(true)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13,
          }}>Monitorear ahora</button>
        </div>
      )}

      {isNearDue && (
        <div style={{
          background: '#fefce8', border: '1px solid #fde047', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#a16207' }}>Monitoreo próximo</div>
          <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>
            Hace {cycle.days_without_monitoring} días sin monitorear · frecuencia esperada: {cycle.monitoring_frequency_days}d
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Cycle stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginBottom: 4 }}>Días desde inicio</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-text)' }}>{ddt >= 0 ? ddt : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>días desde trasplante</div>
          </div>

          <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginBottom: 4 }}>Monitoreos realizados</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-text)' }}>{monitorings.length}</div>
            <div style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>
              {cycle.last_monitored_at ? `Último: ${formatDateShort(cycle.last_monitored_at)}` : 'Sin monitoreos aún'}
            </div>
          </div>

          <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginBottom: 4 }}>Grados día acumulados</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--p-text)' }}>
              {cycle.degree_days != null ? Math.round(cycle.degree_days) : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>
              {cycle.base_temp != null ? `base ${cycle.base_temp}°C · incluye parcial hoy` : 'sin nodos asignados'}
            </div>
          </div>
        </div>

        {/* Events */}
        <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)' }}>Eventos del ciclo</div>
            {isActive && (
              <button onClick={() => setShowAddEvent(true)} style={{
                padding: '5px 14px', borderRadius: 8, border: 'none',
                background: 'var(--p-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>+ Registrar evento</button>
            )}
          </div>

          {events.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--p-text-muted)', padding: '12px 0', textAlign: 'center' }}>
              Sin eventos registrados.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {events.map(ev => {
                const ecfg = EVENT_CONFIG[ev.event_type]
                return (
                  <div key={ev.id} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '10px 0', borderBottom: '1px solid var(--p-border-light)',
                  }}>
                    <div style={{ marginTop: 3, width: 10, height: 10, borderRadius: '50%', background: ecfg.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                          background: ecfg.bg, color: ecfg.color,
                        }}>{ecfg.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--p-text-muted)' }}>
                          {new Date(ev.occurred_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {ev.days_from_transplant != null && (
                            <span> · ddt {ev.days_from_transplant}d</span>
                          )}
                        </span>
                        {/* Show created_at if it's a different day than occurred_at */}
                        {ev.occurred_at.slice(0, 10) !== ev.created_at.slice(0, 10) && (
                          <span style={{ fontSize: 11, color: 'var(--p-text-muted)', fontStyle: 'italic' }}>
                            (cargado el {new Date(ev.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })})
                          </span>
                        )}
                      </div>
                      {ev.event_type === 'application' && (() => {
                        const appData = ev.data as { products?: ApplicationProduct[] } | null
                        const prods = appData?.products ?? []
                        if (prods.length === 0) return null
                        return (
                          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {prods.map((p, i) => (
                              <div key={i} style={{ fontSize: 13, color: 'var(--p-text-secondary)' }}>
                                <strong>{p.commercial_name}</strong>
                                {p.active_ingredient && (
                                  <span style={{ color: 'var(--p-text-muted)', marginLeft: 4 }}>({p.active_ingredient})</span>
                                )}
                                {p.dose != null && (
                                  <span style={{ marginLeft: 6 }}>· {p.dose} {p.dose_unit ?? ''}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      })()}
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

        {/* Monitoring history */}
        <div style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)' }}>
              Historial de monitoreos
            </div>
            {isActive && (
              <button onClick={() => setShowForm(true)} style={{
                padding: '7px 16px', borderRadius: 8, border: 'none',
                background: 'var(--p-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>+ Nuevo monitoreo</button>
            )}
          </div>

          {monitorings.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--p-text-muted)', padding: '16px 0', textAlign: 'center' }}>
              Sin monitoreos registrados. Realizá el primero para comenzar el seguimiento.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {monitorings.map(m => (
                <MonitoringCard key={m.id} monitoring={m} items={items} />
              ))}
            </div>
          )}
        </div>

      </div>

      {showAddEvent && (
        <AddEventModal
          cycleId={cycleId!}
          onClose={() => setShowAddEvent(false)}
          onSaved={() => {
            setShowAddEvent(false)
            queryClient.invalidateQueries({ queryKey: ['cycleEvents', cycleId] })
          }}
        />
      )}

      {showForm && (
        <MonitoringFormModal
          cycleId={cycleId!}
          cycleStartedAt={cycle.started_at}
          onClose={() => setShowForm(false)}
          onSaved={(lotStatus) => {
            setShowForm(false)
            queryClient.invalidateQueries({ queryKey: ['monitorings', cycleId] })
            queryClient.invalidateQueries({ queryKey: ['cycle', cycleId] })
            queryClient.invalidateQueries({ queryKey: ['cycles', cycle.lot_id] })
            // Invalidate lot so the semaphore color in the lot list updates
            queryClient.invalidateQueries({ queryKey: ['lot', cycle.lot_id] })
            console.info(`Lot status updated to: ${lotStatus}`)
          }}
        />
      )}
    </div>
  )
}
