import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getIrrigationTurns,
  getTurnHistory,
  createTurn,
  getControllers,
  type IrrigationTurn,
  type TurnHistoryEntry,
  type CreateTurnData,
} from '../../services/irrigationService'

const ROLES_CLAIM = `${import.meta.env.VITE_AUTH0_AUDIENCE}/roles`
const ALLOWED_ROLES = ['producer', 'operator', 'superuser']

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<IrrigationTurn['status'], { bg: string; text: string; label: string }> = {
  active:   { bg: '#d1fae5', text: '#065f46', label: 'Activo'     },
  paused:   { bg: '#fef3c7', text: '#92400e', label: 'Pausado'    },
  error:    { bg: '#fee2e2', text: '#991b1b', label: 'Error'      },
  finished: { bg: '#e5e7eb', text: '#374151', label: 'Finalizado' },
}

function StatusBadge({ status }: { status: IrrigationTurn['status'] }) {
  const { bg, text, label } = STATUS_COLORS[status]
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color: text }}>
      {label}
    </span>
  )
}

// ── ETc progress bar ──────────────────────────────────────────────────────────

function ETcBar({ accumulated }: { accumulated: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
        <span>ETc acumulada</span>
        <span style={{ fontWeight: 600, color: '#374151' }}>{accumulated.toFixed(2)} L</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: '#e5e7eb', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: '100%', background: '#10b981', borderRadius: 4 }} />
      </div>
    </div>
  )
}

// ── Turn history drawer ───────────────────────────────────────────────────────

function TurnHistoryDrawer({ turn, onClose }: { turn: IrrigationTurn; onClose: () => void }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['turn-history', turn.id],
    queryFn: () => getTurnHistory(turn.id),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      {/* Panel */}
      <div style={{ width: 520, background: '#fff', height: '100vh', overflowY: 'auto', padding: 24, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>{turn.name}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>{turn.crop} · {turn.kc_stage_active}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <Stat label="Días desde siembra" value={String(turn.days_since_sowing)} />
          <Stat label="Etapa Kc" value={turn.kc_stage_active} />
          <Stat label="ETc acumulada (L)" value={turn.etc_accumulated_l.toFixed(2)} />
          <Stat label="Próximo riego" value={turn.next_irrigation_at ? new Date(turn.next_irrigation_at).toLocaleString() : '—'} />
        </div>

        <h4 style={{ margin: '24px 0 12px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          Historial planificado vs ejecutado vs observado
        </h4>

        {isLoading && <p style={{ color: '#9ca3af', textAlign: 'center' }}>Cargando historial...</p>}

        {history && history.length > 0 && (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis unit=" mm" tick={{ fontSize: 10 }} width={44} />
                <Tooltip formatter={(v) => `${(v as number).toFixed(2)} mm`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="planned_mm"  name="Planificado" fill="#93c5fd" radius={[2,2,0,0]} />
                <Bar dataKey="executed_mm" name="Ejecutado"   fill="#3b82f6" radius={[2,2,0,0]} />
                <Bar dataKey="observed_mm" name="Observado"   fill="#1d4ed8" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Fecha', 'Planif. (mm)', 'Ejecutado (mm)', 'Observado (mm)'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row: TurnHistoryEntry) => (
                  <tr key={row.date} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{row.date}</td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{row.planned_mm?.toFixed(2) ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{row.executed_mm?.toFixed(2) ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{row.observed_mm?.toFixed(2) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {history && history.length === 0 && (
          <p style={{ color: '#9ca3af', textAlign: 'center' }}>Sin historial registrado.</p>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{value}</div>
    </div>
  )
}

// ── Nuevo turno modal ─────────────────────────────────────────────────────────

function NewTurnModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CreateTurnData>({ name: '', crop: '', threshold_mm: 0.5, controller_id: '' })

  const { data: controllers } = useQuery({ queryKey: ['controllers'], queryFn: getControllers })

  const mutation = useMutation({
    mutationFn: createTurn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['irrigation-turns'] })
      onClose()
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate(form)
  }

  const field = (label: string, node: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</label>
      {node}
    </div>
  )

  const inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 12, padding: 28, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Nuevo turno de riego</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {field('Nombre', <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />)}
          {field('Cultivo', <input style={inputStyle} value={form.crop} onChange={e => setForm(f => ({ ...f, crop: e.target.value }))} required />)}
          {field('Threshold ETc (mm)', <input style={inputStyle} type="number" step="0.01" value={form.threshold_mm} onChange={e => setForm(f => ({ ...f, threshold_mm: Number(e.target.value) }))} required />)}
          {field('Controlador', (
            <select style={inputStyle} value={form.controller_id} onChange={e => setForm(f => ({ ...f, controller_id: e.target.value }))} required>
              <option value="">Seleccionar...</option>
              {controllers?.map(c => <option key={c.id} value={c.id}>{c.device_name}</option>)}
            </select>
          ))}
          {mutation.isError && <p style={{ margin: 0, color: '#991b1b', fontSize: 13 }}>Error al crear el turno.</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
              {mutation.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Turn card ─────────────────────────────────────────────────────────────────

function TurnCard({ turn, onClick }: { turn: IrrigationTurn; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{turn.name}</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{turn.crop}</div>
        </div>
        <StatusBadge status={turn.status} />
      </div>

      <ETcBar accumulated={turn.etc_accumulated_l} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 14, fontSize: 12 }}>
        <div>
          <div style={{ color: '#9ca3af' }}>Próximo riego</div>
          <div style={{ fontWeight: 600, color: '#374151', marginTop: 2 }}>
            {turn.next_irrigation_at ? new Date(turn.next_irrigation_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
          </div>
        </div>
        <div>
          <div style={{ color: '#9ca3af' }}>Etapa Kc · días</div>
          <div style={{ fontWeight: 600, color: '#374151', marginTop: 2 }}>{turn.kc_stage_active} · {turn.days_since_sowing}d</div>
        </div>
      </div>
    </div>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function IrrigationModule() {
  const { user } = useAuth0()
  const [selectedTurn, setSelectedTurn] = useState<IrrigationTurn | null>(null)
  const [showNewTurn, setShowNewTurn] = useState(false)

  const userRoles: string[] = (user?.[ROLES_CLAIM] as string[]) ?? []
  const canCreate = userRoles.some(r => ALLOWED_ROLES.includes(r))

  const { data: turns, isLoading, isError } = useQuery({
    queryKey: ['irrigation-turns'],
    queryFn: getIrrigationTurns,
  })

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#111827' }}>Riego</h2>
        {canCreate && (
          <button
            onClick={() => setShowNewTurn(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
          >
            + Nuevo turno
          </button>
        )}
      </div>

      {isError && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          Error al cargar los turnos de riego.
        </div>
      )}

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 130, borderRadius: 10, background: '#f3f4f6' }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {turns?.map(turn => (
          <TurnCard key={turn.id} turn={turn} onClick={() => setSelectedTurn(turn)} />
        ))}
        {!isLoading && turns?.length === 0 && (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32 }}>No hay turnos de riego activos.</p>
        )}
      </div>

      {selectedTurn && (
        <TurnHistoryDrawer turn={selectedTurn} onClose={() => setSelectedTurn(null)} />
      )}
      {showNewTurn && <NewTurnModal onClose={() => setShowNewTurn(false)} />}
    </div>
  )
}
