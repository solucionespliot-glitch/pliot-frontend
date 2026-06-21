import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSiteContext } from '../../hooks/useSiteContext'
import {
  getSiteLots,
  createLot,
  patchLot,
  deleteLot,
  type Lot,
  type LotStatus,
  type CreateLotPayload,
} from '../../services/lotsService'
import { getSiteDevices, type Device } from '../../services/devicesService'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<LotStatus, { bg: string; border: string; text: string; label: string; dot: string }> = {
  green:  { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Bien',     dot: '#22c55e' },
  yellow: { bg: '#fefce8', border: '#fde047', text: '#a16207', label: 'Regular',  dot: '#eab308' },
  red:    { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', label: 'Alerta',   dot: '#ef4444' },
}

const EVENT_LABELS: Record<string, string> = {
  sowing:      'Siembra',
  transplant:  'Trasplante',
  application: 'Aplicación',
  harvest:     'Cosecha',
}

const CROP_OPTIONS = [
  'Tomate', 'Lechuga', 'Espinaca', 'Pimiento', 'Pepino',
  'Berenjena', 'Zapallo', 'Chaucha', 'Apio', 'Perejil', 'Otro',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86_400_000)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  return `hace ${d} días`
}

// ── Create lot modal ──────────────────────────────────────────────────────────

function CreateLotModal({ siteId, devices, onClose, onCreated }: {
  siteId: string
  devices: Device[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name,     setName]     = useState('')
  const [cropType, setCropType] = useState('')
  const [areaHa,   setAreaHa]   = useState('')
  const [nodeIds,  setNodeIds]  = useState<string[]>([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  function toggleNode(id: string) {
    setNodeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    setError(null)
    try {
      const payload: CreateLotPayload = { name: name.trim() }
      if (cropType) payload.crop_type = cropType
      if (areaHa)   payload.area_ha   = Number(areaHa)
      if (nodeIds.length > 0) payload.node_ids = nodeIds
      await createLot(siteId, payload)
      onCreated()
    } catch {
      setError('No se pudo crear el lote. Intentá de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--p-surface)', borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Nuevo lote</h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <label style={labelStyle}>
            Nombre *
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Lote A"
              style={inputStyle} autoFocus />
          </label>

          <label style={labelStyle}>
            Cultivo
            <select value={cropType} onChange={e => setCropType(e.target.value)} style={inputStyle}>
              <option value="">— Sin especificar —</option>
              {CROP_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label style={labelStyle}>
            Superficie (ha)
            <input type="number" min="0" step="0.01" value={areaHa}
              onChange={e => setAreaHa(e.target.value)} placeholder="Ej: 0.5" style={inputStyle} />
          </label>

          {devices.length > 0 && (
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)', display: 'block', marginBottom: 6 }}>
                Nodos asignados
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {devices.map(d => {
                  const selected = nodeIds.includes(d.id)
                  return (
                    <button key={d.id} type="button" onClick={() => toggleNode(d.id)} style={{
                      fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                      border: `1px solid ${selected ? 'var(--p-primary)' : 'var(--p-border)'}`,
                      background: selected ? 'var(--p-primary)' : 'var(--p-bg)',
                      color: selected ? '#fff' : 'var(--p-text-secondary)',
                      fontWeight: selected ? 600 : 400,
                    }}>
                      {d.display_name || d.device_id}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={secondaryBtnStyle}>Cancelar</button>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>
              {saving ? 'Guardando...' : 'Crear lote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Lot card ──────────────────────────────────────────────────────────────────

function LotCard({ lot, onClick, onStatusChange, onDelete }: {
  lot: Lot
  onClick: () => void
  onStatusChange: (lotId: string, status: LotStatus) => void
  onDelete: (lotId: string, name: string) => void
}) {
  const cfg = STATUS_CONFIG[lot.status]

  return (
    <div onClick={onClick} style={{
      background: cfg.bg,
      border: `2px solid ${cfg.border}`,
      borderRadius: 12, padding: 0,
      cursor: 'pointer', transition: 'box-shadow 0.15s',
      display: 'flex', flexDirection: 'column',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${cfg.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--p-text)' }}>{lot.name}</div>
            {lot.crop_type && (
              <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginTop: 2 }}>{lot.crop_type}{lot.area_ha ? ` · ${lot.area_ha} ha` : ''}</div>
            )}
          </div>
          {/* Status badge — click cycles through statuses */}
          <button
            onClick={e => {
              e.stopPropagation()
              const next: LotStatus = lot.status === 'green' ? 'yellow' : lot.status === 'yellow' ? 'red' : 'green'
              onStatusChange(lot.id, next)
            }}
            title="Cambiar estado"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              border: `1px solid ${cfg.border}`, background: '#fff',
              color: cfg.text, cursor: 'pointer',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
            {cfg.label}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 16px', flex: 1 }}>
        {/* Assigned nodes */}
        {lot.nodes.length > 0 ? (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--p-text-muted)', display: 'block', marginBottom: 3 }}>Nodos</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {lot.nodes.map(n => (
                <span key={n.device_uuid} style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 10,
                  background: 'rgba(0,0,0,0.06)', color: 'var(--p-text-secondary)',
                }}>
                  {n.display_name || n.device_id}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginBottom: 8 }}>Sin nodo asignado</div>
        )}

        {/* Last event */}
        {lot.last_event ? (
          <div style={{ fontSize: 12, color: 'var(--p-text-secondary)' }}>
            <span style={{ fontWeight: 600 }}>{EVENT_LABELS[lot.last_event.event_type] ?? lot.last_event.event_type}</span>
            {' · '}{formatRelative(lot.last_event.occurred_at)}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--p-text-muted)' }}>Sin eventos registrados</div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px', borderTop: `1px solid ${cfg.border}`,
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <button
          onClick={e => { e.stopPropagation(); onDelete(lot.id, lot.name) }}
          style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Eliminar
        </button>
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)',
}
const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 7, border: '1px solid var(--p-border)',
  fontSize: 14, color: 'var(--p-text)', background: 'var(--p-bg)', outline: 'none',
}
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, border: 'none',
  background: 'var(--p-primary)', color: '#fff', fontSize: 14,
  fontWeight: 600, cursor: 'pointer',
}
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8,
  border: '1px solid var(--p-border)', background: 'var(--p-bg)',
  color: 'var(--p-text-secondary)', fontSize: 14, cursor: 'pointer',
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function LotsModule() {
  const { siteId } = useSiteContext()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: lots = [], isLoading, isError } = useQuery({
    queryKey: ['lots', siteId],
    queryFn:  () => getSiteLots(siteId!),
    enabled:  !!siteId,
  })

  // Load devices so the create modal can offer node assignment
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', siteId],
    queryFn:  () => getSiteDevices(siteId!),
    enabled:  !!siteId,
  })

  async function handleStatusChange(lotId: string, status: LotStatus) {
    await patchLot(lotId, { status })
    queryClient.invalidateQueries({ queryKey: ['lots', siteId] })
  }

  async function handleDelete(lotId: string, name: string) {
    if (!confirm(`¿Eliminar el lote "${name}"? Esta acción no se puede deshacer.`)) return
    await deleteLot(lotId)
    queryClient.invalidateQueries({ queryKey: ['lots', siteId] })
  }

  if (!siteId) {
    return (
      <div style={{ padding: 32, color: 'var(--p-text-secondary)' }}>
        Sin site seleccionado. <a href="/select-site" style={{ color: 'var(--p-primary)' }}>Seleccionar site</a>
      </div>
    )
  }

  // Summary counts for the header
  const countByStatus = { green: 0, yellow: 0, red: 0 }
  for (const l of lots) countByStatus[l.status]++

  return (
    <div style={{ padding: '20px 20px 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--p-text)', flex: 1 }}>Lotes</h2>

        {/* Semaphore summary */}
        {lots.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {(['green', 'yellow', 'red'] as LotStatus[]).map(s => (
              <span key={s} style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 13,
                padding: '4px 10px', borderRadius: 20,
                background: STATUS_CONFIG[s].bg, border: `1px solid ${STATUS_CONFIG[s].border}`,
                color: STATUS_CONFIG[s].text, fontWeight: 600,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_CONFIG[s].dot, display: 'inline-block' }} />
                {countByStatus[s]}
              </span>
            ))}
          </div>
        )}

        <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>
          + Nuevo lote
        </button>
      </div>

      {isError && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          Error al cargar los lotes.
        </div>
      )}

      {isLoading && (
        <div style={{ color: 'var(--p-text-muted)', padding: 40, textAlign: 'center' }}>Cargando lotes...</div>
      )}

      {!isLoading && lots.length === 0 && (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: 'var(--p-surface)', borderRadius: 12, border: '1px solid var(--p-border)',
        }}>
          <div style={{ fontSize: 15, color: 'var(--p-text-secondary)', marginBottom: 12 }}>No hay lotes cargados para este site.</div>
          <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>Crear el primer lote</button>
        </div>
      )}

      {/* Lots grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {lots.map(lot => (
          <LotCard
            key={lot.id}
            lot={lot}
            onClick={() => navigate(`/dashboard/lots/${lot.id}`)}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {showCreate && (
        <CreateLotModal
          siteId={siteId}
          devices={devices}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['lots', siteId] })
          }}
        />
      )}
    </div>
  )
}
