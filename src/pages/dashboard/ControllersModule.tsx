import { useState, useEffect } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import {
  getControllers,
  getFoggers,
  updateControllerOverride,
  getControllerActuators,
  updateActuatorNodes,
  type Controller,
  type Fogger,
  type Actuator,
} from '../../services/irrigationService'
import { getSiteDevices } from '../../services/devicesService'
import { fetchMe } from '../../services/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SYNC_COLORS: Record<Controller['sync_status'], { bg: string; text: string }> = {
  synced:  { bg: '#d1fae5', text: '#065f46' },
  pending: { bg: '#fef3c7', text: '#92400e' },
  error:   { bg: '#fee2e2', text: '#991b1b' },
}

function SyncBadge({ status }: { status: Controller['sync_status'] }) {
  const { bg, text } = SYNC_COLORS[status]
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color: text }}>
      {status}
    </span>
  )
}

const FOGGER_STATUS_COLORS: Record<Fogger['status'], { bg: string; text: string }> = {
  active: { bg: '#d1fae5', text: '#065f46' },
  idle:   { bg: '#f3f4f6', text: '#6b7280' },
  error:  { bg: '#fee2e2', text: '#991b1b' },
}

function FoggerStatusBadge({ status }: { status: Fogger['status'] }) {
  const { bg, text } = FOGGER_STATUS_COLORS[status]
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color: text }}>
      {status}
    </span>
  )
}

function formatHeartbeat(ts: string | null): string {
  if (!ts) return '—'
  const diffMs = Date.now() - new Date(ts).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `${diffMin}m atrás`
  return `${Math.floor(diffMin / 60)}h atrás`
}

const OVERRIDE_OPTIONS: { value: Controller['override_mode']; label: string }[] = [
  { value: 'none',           label: 'Ninguno'        },
  { value: 'temporary_24h', label: 'Temporal 24h'    },
  { value: 'temporary_48h', label: 'Temporal 48h'    },
  { value: 'permanent',     label: 'Permanente'      },
]

// ── Actuator panel — relay/node assignment ────────────────────────────────────

function ActuatorPanel({ controllerId, siteId, canEdit }: {
  controllerId: string
  siteId: string | null
  canEdit: boolean
}) {
  const queryClient = useQueryClient()

  const { data: actuators, isLoading: loadingActuators } = useQuery({
    queryKey: ['controller-actuators', controllerId],
    queryFn: () => getControllerActuators(controllerId),
  })

  const { data: devices } = useQuery({
    queryKey: ['site-devices', siteId],
    queryFn: () => siteId ? getSiteDevices(siteId) : Promise.resolve([]),
    enabled: !!siteId,
  })

  // Only offer sensors as selectable nodes (LoRa or WiFi)
  const sensorDevices = (devices ?? []).filter(d =>
    d.device_type === 'lora_sensor' || d.device_type === 'wifi_sensor'
  )

  // Local selection per actuator id → sensor device UUID or ''
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [saving, setSaving]         = useState<string | null>(null)
  const [saveError, setSaveError]   = useState<string | null>(null)

  // Initialize selections when actuator data loads
  useEffect(() => {
    if (!actuators) return
    const init: Record<string, string> = {}
    for (const a of actuators) {
      init[a.id] = a.influence_nodes[0]?.id ?? ''
    }
    setSelections(init)
  }, [actuators])

  async function handleSave(actuator: Actuator) {
    setSaving(actuator.id)
    setSaveError(null)
    try {
      const nodeId = selections[actuator.id]
      await updateActuatorNodes(controllerId, actuator.id, nodeId ? [nodeId] : [])
      // Refresh actuator list so influence_nodes reflects the updated value
      await queryClient.invalidateQueries({ queryKey: ['controller-actuators', controllerId] })
    } catch {
      setSaveError('Error al guardar. Intentá de nuevo.')
    } finally {
      setSaving(null)
    }
  }

  if (loadingActuators) {
    return (
      <div style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>
        Cargando relés...
      </div>
    )
  }

  const rows = actuators ?? []

  return (
    <div style={{ padding: '12px 20px 16px', background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
        Relés y nodos de influencia
      </div>
      {saveError && (
        <div style={{ marginBottom: 8, padding: '6px 10px', background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 12 }}>
          {saveError}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(a => {
          const label = a.label || `Re${a.relay_index + 1}`
          const currentNodeId   = selections[a.id] ?? ''
          const persistedNodeId = a.influence_nodes[0]?.id ?? ''
          const changed         = currentNodeId !== persistedNodeId
          return (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 6, padding: '7px 12px',
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, minWidth: 52, color: '#111827' }}>
                {label}
              </span>
              {canEdit ? (
                <>
                  <select
                    value={currentNodeId}
                    onChange={e => setSelections(s => ({ ...s, [a.id]: e.target.value }))}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13, color: '#111827' }}
                  >
                    <option value="">— Sin nodo —</option>
                    {sensorDevices.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.display_name || d.device_id}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSave(a)}
                    disabled={!changed || saving === a.id}
                    style={{
                      padding: '5px 14px', borderRadius: 4, border: 'none',
                      background: changed ? '#2563eb' : '#e5e7eb',
                      color: changed ? '#fff' : '#9ca3af',
                      cursor: changed && saving !== a.id ? 'pointer' : 'default',
                      fontSize: 12, fontWeight: 600, flexShrink: 0,
                    }}
                  >
                    {saving === a.id ? '…' : 'Guardar'}
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 13, color: '#6b7280' }}>
                  {a.influence_nodes[0]?.device_id ?? '—'}
                </span>
              )}
            </div>
          )
        })}
        {rows.length === 0 && (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>No hay actuadores configurados.</div>
        )}
      </div>
    </div>
  )
}

// ── Controller row ────────────────────────────────────────────────────────────

function ControllerRow({ controller, expanded, onToggle, canEdit }: {
  controller: Controller
  expanded: boolean
  onToggle: () => void
  canEdit: boolean
}) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (mode: Controller['override_mode']) =>
      updateControllerOverride(controller.id, mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['controllers'] }),
  })

  return (
    <>
      <tr style={{ borderBottom: expanded ? 'none' : '1px solid #f3f4f6' }}>
        <td style={{ padding: '12px 16px', fontWeight: 500, color: '#111827' }}>{controller.device_name}</td>
        <td style={{ padding: '12px 16px' }}>
          <SyncBadge status={controller.sync_status} />
        </td>
        <td style={{ padding: '12px 16px' }}>
          <select
            value={controller.override_mode}
            disabled={mutation.isPending}
            onChange={e => mutation.mutate(e.target.value as Controller['override_mode'])}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, cursor: 'pointer' }}
          >
            {OVERRIDE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {mutation.isError && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#991b1b' }}>Error</span>
          )}
        </td>
        <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>
          {formatHeartbeat(controller.last_seen_at)}
        </td>
        <td style={{ padding: '12px 16px' }}>
          <button
            onClick={onToggle}
            style={{
              padding: '4px 10px', borderRadius: 5, border: '1px solid #d1d5db',
              background: expanded ? '#eff6ff' : '#fff',
              color: expanded ? '#2563eb' : '#374151',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {expanded ? '▲ Relés' : '▼ Relés'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
          <td colSpan={5} style={{ padding: 0 }}>
            <ActuatorPanel
              controllerId={controller.id}
              siteId={controller.site_id ?? null}
              canEdit={canEdit}
            />
          </td>
        </tr>
      )}
    </>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function ControllersModule() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  // producer, distributor, and superuser can edit node assignments
  const canEdit = me?.role === 'producer' || me?.role === 'distributor' || me?.role === 'superuser'

  const {
    data: controllers,
    isLoading: loadingControllers,
    isError: errorControllers,
  } = useQuery({ queryKey: ['controllers'], queryFn: getControllers })

  const {
    data: foggers,
    isLoading: loadingFoggers,
    isError: errorFoggers,
  } = useQuery({ queryKey: ['foggers'], queryFn: getFoggers })

  const sectionTitle = (title: string) => (
    <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#374151' }}>{title}</h3>
  )

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#111827' }}>Controladores y Foggers</h2>

      {/* Controllers section */}
      <div>
        {sectionTitle('Controladores')}
        {errorControllers && (
          <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
            Error al cargar controladores.
          </div>
        )}
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Nombre', 'Sync', 'Override mode', 'Último heartbeat', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingControllers && Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} style={{ padding: '12px 16px' }}>
                      <div style={{ height: 14, borderRadius: 4, background: '#e5e7eb', width: j === 0 ? 120 : 80 }} />
                    </td>
                  ))}
                </tr>
              ))}
              {controllers?.map(c => (
                <ControllerRow
                  key={c.id}
                  controller={c}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  canEdit={canEdit}
                />
              ))}
              {!loadingControllers && controllers?.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af' }}>
                    No hay controladores registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Foggers section */}
      <div>
        {sectionTitle('Foggers')}
        {errorFoggers && (
          <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
            Error al cargar foggers.
          </div>
        )}
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Nombre', 'Estado', 'Behavior config'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingFoggers && Array.from({ length: 2 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 3 }).map((_, j) => (
                    <td key={j} style={{ padding: '12px 16px' }}>
                      <div style={{ height: 14, borderRadius: 4, background: '#e5e7eb', width: j === 2 ? 200 : 100 }} />
                    </td>
                  ))}
                </tr>
              ))}
              {foggers?.map((f: Fogger) => (
                <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: '#111827' }}>{f.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <FoggerStatusBadge status={f.status} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <code style={{ fontSize: 12, background: '#f9fafb', padding: '2px 6px', borderRadius: 4, color: '#374151', display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(f.behavior_config)}
                    </code>
                  </td>
                </tr>
              ))}
              {!loadingFoggers && foggers?.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af' }}>
                    No hay foggers registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
