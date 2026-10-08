import { useState } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import {
  getControllers,
  getFoggers,
  updateControllerOverride,
  getControllerActuators,
  updateActuatorNodes,
  updateActuator,
  sendCommand,
  type Controller,
  type Fogger,
  type Actuator,
  type BehaviorType,
  type BehaviorConfig,
  type VpdConfig,
  type ScheduleConfig,
  type IrrigationConfig,
  type TemperatureConfig,
} from '../../services/irrigationService'
import { getSiteDevices, type Device } from '../../services/devicesService'
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

// ── Behavior type helpers ─────────────────────────────────────────────────────

const BEHAVIOR_LABELS: Record<BehaviorType, string> = {
  vpd:         'VPD',
  schedule:    'Horario',
  irrigation:  'Riego',
  temperature: 'Temperatura',
  manual:      'Manual',
}

const BEHAVIOR_COLORS: Record<BehaviorType, { bg: string; text: string }> = {
  vpd:         { bg: '#dbeafe', text: '#1e40af' },
  schedule:    { bg: '#d1fae5', text: '#065f46' },
  irrigation:  { bg: '#ede9fe', text: '#4c1d95' },
  temperature: { bg: '#fee2e2', text: '#991b1b' },
  manual:      { bg: '#f3f4f6', text: '#6b7280' },
}

function BehaviorBadge({ type }: { type: BehaviorType }) {
  const { bg, text } = BEHAVIOR_COLORS[type] ?? BEHAVIOR_COLORS.manual
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: bg, color: text }}>
      {BEHAVIOR_LABELS[type] ?? type}
    </span>
  )
}

// Returns a sensible default config for a given behavior type.
function defaultConfig(type: BehaviorType): BehaviorConfig {
  switch (type) {
    case 'vpd':         return { vpd_threshold: 1.2, on_duration_seconds: 30, off_duration_seconds: 120, vpd_logic: 'any', hysteresis: 0.1, stale_timeout_minutes: 15 } as VpdConfig
    case 'schedule':    return { days: [1,2,3,4,5,6,7], windows: [{ on_time: '08:00', off_time: '20:00' }] } as ScheduleConfig
    case 'irrigation':  return { days: [1,2,3,4,5,6,7], events: [{ time: '08:00', duration_minutes: 5 }] } as IrrigationConfig
    case 'temperature': return { mode: 'cool', min_temp: 20, max_temp: 30, hysteresis: 0.5, stale_timeout_minutes: 15 } as TemperatureConfig
    default:            return {}
  }
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ALL_DAYS   = [1, 2, 3, 4, 5, 6, 7]

// Shared input style
const inputStyle: React.CSSProperties = {
  padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4,
  fontSize: 13, color: '#111827', background: '#fff',
}

// ── Days picker ───────────────────────────────────────────────────────────────

function DaysPicker({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  function toggle(day: number) {
    onChange(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort())
  }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {ALL_DAYS.map((d, i) => (
        <button
          key={d}
          type="button"
          onClick={() => toggle(d)}
          style={{
            padding: '3px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12,
            fontWeight: 600, cursor: 'pointer',
            background: days.includes(d) ? '#2563eb' : '#fff',
            color:      days.includes(d) ? '#fff'    : '#374151',
          }}
        >
          {DAY_LABELS[i]}
        </button>
      ))}
    </div>
  )
}

// ── Per-type config forms ─────────────────────────────────────────────────────

function VpdForm({ config, onChange }: { config: VpdConfig; onChange: (c: VpdConfig) => void }) {
  function set<K extends keyof VpdConfig>(k: K, v: VpdConfig[K]) { onChange({ ...config, [k]: v }) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Umbral VPD (kPa)
          <br />
          <input type="number" step="0.1" min="0" max="5" value={config.vpd_threshold}
            onChange={e => set('vpd_threshold', parseFloat(e.target.value))}
            style={{ ...inputStyle, width: 80 }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Histéresis (kPa)
          <br />
          <input type="number" step="0.05" min="0" max="2" value={config.hysteresis}
            onChange={e => set('hysteresis', parseFloat(e.target.value))}
            style={{ ...inputStyle, width: 70 }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          ON (seg)
          <br />
          <input type="number" step="1" min="1" max="3600" value={config.on_duration_seconds}
            onChange={e => set('on_duration_seconds', parseInt(e.target.value))}
            style={{ ...inputStyle, width: 70 }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          OFF (seg)
          <br />
          <input type="number" step="1" min="1" max="3600" value={config.off_duration_seconds}
            onChange={e => set('off_duration_seconds', parseInt(e.target.value))}
            style={{ ...inputStyle, width: 70 }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Sin datos (min)
          <br />
          <input type="number" step="1" min="1" max="60" value={config.stale_timeout_minutes}
            onChange={e => set('stale_timeout_minutes', parseInt(e.target.value))}
            style={{ ...inputStyle, width: 60 }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Lógica nodos
          <br />
          <select value={config.vpd_logic} onChange={e => set('vpd_logic', e.target.value as VpdConfig['vpd_logic'])}
            style={{ ...inputStyle }}>
            <option value="any">Cualquiera (MAX)</option>
            <option value="all">Todos (MIN)</option>
            <option value="average">Promedio</option>
          </select>
        </label>
      </div>
    </div>
  )
}

function ScheduleForm({ config, onChange }: { config: ScheduleConfig; onChange: (c: ScheduleConfig) => void }) {
  function setDays(days: number[]) { onChange({ ...config, days }) }
  function setWindow(i: number, key: 'on_time' | 'off_time', v: string) {
    const windows = config.windows.map((w, idx) => idx === i ? { ...w, [key]: v } : w)
    onChange({ ...config, windows })
  }
  function addWindow() { onChange({ ...config, windows: [...config.windows, { on_time: '08:00', off_time: '20:00' }] }) }
  function removeWindow(i: number) { onChange({ ...config, windows: config.windows.filter((_, idx) => idx !== i) }) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Días activos</div>
        <DaysPicker days={config.days} onChange={setDays} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Ventanas horarias</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {config.windows.map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="time" value={w.on_time}  onChange={e => setWindow(i, 'on_time',  e.target.value)} style={{ ...inputStyle }} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>→</span>
              <input type="time" value={w.off_time} onChange={e => setWindow(i, 'off_time', e.target.value)} style={{ ...inputStyle }} />
              {config.windows.length > 1 && (
                <button type="button" onClick={() => removeWindow(i)}
                  style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>✕</button>
              )}
            </div>
          ))}
          {config.windows.length < 10 && (
            <button type="button" onClick={addWindow}
              style={{ alignSelf: 'flex-start', marginTop: 2, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Agregar ventana
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function IrrigationForm({ config, onChange }: { config: IrrigationConfig; onChange: (c: IrrigationConfig) => void }) {
  function setDays(days: number[]) { onChange({ ...config, days }) }
  function setEvent(i: number, key: keyof IrrigationConfig['events'][0], v: string | number) {
    const events = config.events.map((ev, idx) => idx === i ? { ...ev, [key]: v } : ev)
    onChange({ ...config, events })
  }
  function addEvent() { onChange({ ...config, events: [...config.events, { time: '08:00', duration_minutes: 5 }] }) }
  function removeEvent(i: number) { onChange({ ...config, events: config.events.filter((_, idx) => idx !== i) }) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Días activos</div>
        <DaysPicker days={config.days} onChange={setDays} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Eventos de riego</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {config.events.map((ev, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="time" value={ev.time}
                onChange={e => setEvent(i, 'time', e.target.value)} style={{ ...inputStyle }} />
              <input type="number" min="1" max="1440" value={ev.duration_minutes}
                onChange={e => setEvent(i, 'duration_minutes', parseInt(e.target.value))}
                style={{ ...inputStyle, width: 60 }} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>min</span>
              {config.events.length > 1 && (
                <button type="button" onClick={() => removeEvent(i)}
                  style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>✕</button>
              )}
            </div>
          ))}
          {config.events.length < 20 && (
            <button type="button" onClick={addEvent}
              style={{ alignSelf: 'flex-start', marginTop: 2, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Agregar evento
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TemperatureForm({ config, onChange }: { config: TemperatureConfig; onChange: (c: TemperatureConfig) => void }) {
  function set<K extends keyof TemperatureConfig>(k: K, v: TemperatureConfig[K]) { onChange({ ...config, [k]: v }) }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
      <label style={{ fontSize: 12, color: '#6b7280' }}>
        Modo
        <br />
        <select value={config.mode} onChange={e => set('mode', e.target.value as 'heat' | 'cool')} style={{ ...inputStyle }}>
          <option value="cool">Enfriar</option>
          <option value="heat">Calentar</option>
        </select>
      </label>
      <label style={{ fontSize: 12, color: '#6b7280' }}>
        Temp. mín (°C)
        <br />
        <input type="number" step="0.5" min="-20" max="60" value={config.min_temp}
          onChange={e => set('min_temp', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 70 }} />
      </label>
      <label style={{ fontSize: 12, color: '#6b7280' }}>
        Temp. máx (°C)
        <br />
        <input type="number" step="0.5" min="-20" max="60" value={config.max_temp}
          onChange={e => set('max_temp', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 70 }} />
      </label>
      <label style={{ fontSize: 12, color: '#6b7280' }}>
        Histéresis (°C)
        <br />
        <input type="number" step="0.5" min="0" max="10" value={config.hysteresis}
          onChange={e => set('hysteresis', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 70 }} />
      </label>
      <label style={{ fontSize: 12, color: '#6b7280' }}>
        Sin datos (min)
        <br />
        <input type="number" step="1" min="1" max="60" value={config.stale_timeout_minutes}
          onChange={e => set('stale_timeout_minutes', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 60 }} />
      </label>
    </div>
  )
}

// ── ActuatorEditRow ───────────────────────────────────────────────────────────
// Renders one actuator: compact header with type badge, expand for edit form,
// separate expand for manual pulse.

function ActuatorEditRow({ controllerId, actuator, sensorDevices, canEdit }: {
  controllerId: string
  actuator: Actuator
  sensorDevices: Device[]
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [editOpen,  setEditOpen]  = useState(false)
  const [pulseOpen, setPulseOpen] = useState(false)

  // Edit form state — initialized on open from current actuator values
  const [behaviorType, setBehaviorType] = useState<BehaviorType>(actuator.behavior_type)
  const [config, setConfig] = useState<BehaviorConfig>(actuator.behavior_config)
  const [nodeId, setNodeId] = useState(actuator.influence_nodes[0]?.id ?? '')

  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  // Pulse form state
  const [pulseMins,    setPulseMins]    = useState(5)
  const [pulseSending, setPulseSending] = useState(false)
  const [pulseError,   setPulseError]   = useState<string | null>(null)
  const [pulseDone,    setPulseDone]    = useState(false)

  function openEdit() {
    setBehaviorType(actuator.behavior_type)
    setConfig(actuator.behavior_config)
    setNodeId(actuator.influence_nodes[0]?.id ?? '')
    setSaveError(null)
    setEditOpen(true)
    setPulseOpen(false)
  }

  function handleTypeChange(type: BehaviorType) {
    setBehaviorType(type)
    setConfig(defaultConfig(type))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await updateActuator(controllerId, actuator.id, { behavior_type: behaviorType, behavior_config: config })
      // Node assignment: only relevant for sensor-driven types, but we save it for all
      await updateActuatorNodes(controllerId, actuator.id, nodeId ? [nodeId] : [])
      await queryClient.invalidateQueries({ queryKey: ['controller-actuators', controllerId] })
      setEditOpen(false)
    } catch {
      setSaveError('Error al guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePulse() {
    setPulseSending(true)
    setPulseError(null)
    setPulseDone(false)
    try {
      await sendCommand(controllerId, {
        command_type: 'pulseRelay',
        relay_index: actuator.relay_index,
        duration_minutes: pulseMins,
      })
      setPulseDone(true)
      setTimeout(() => { setPulseDone(false); setPulseOpen(false) }, 2500)
    } catch {
      setPulseError('Error al enviar comando.')
    } finally {
      setPulseSending(false)
    }
  }

  const label = actuator.label || `Re${actuator.relay_index + 1}`
  const needsNode = behaviorType === 'vpd' || behaviorType === 'temperature'

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#111827', minWidth: 50 }}>{label}</span>
        <BehaviorBadge type={actuator.behavior_type} />
        <span style={{ fontSize: 12, color: '#9ca3af', flex: 1 }}>
          {actuator.influence_nodes[0]?.device_id ?? ''}
        </span>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => editOpen ? setEditOpen(false) : openEdit()}
              style={{
                padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: editOpen ? '#eff6ff' : '#fff',
                color:      editOpen ? '#2563eb' : '#374151',
              }}
            >
              {editOpen ? '✕ Cerrar' : 'Editar'}
            </button>
            <button
              type="button"
              onClick={() => { setPulseOpen(p => !p); setPulseError(null); setPulseDone(false); setEditOpen(false) }}
              style={{
                padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: pulseOpen ? '#fffbeb' : '#fff',
                color: '#374151',
              }}
            >
              Pulso
            </button>
          </>
        )}
      </div>

      {/* Edit form */}
      {editOpen && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '14px 16px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Behavior type selector */}
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Tipo de comportamiento</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['vpd', 'schedule', 'irrigation', 'temperature', 'manual'] as BehaviorType[]).map(t => (
                <button key={t} type="button" onClick={() => handleTypeChange(t)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                    border: behaviorType === t ? '2px solid #2563eb' : '1px solid #d1d5db',
                    background: behaviorType === t ? '#eff6ff' : '#fff',
                    color: behaviorType === t ? '#2563eb' : '#374151',
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {BEHAVIOR_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Per-type config form */}
          {behaviorType === 'vpd' && (
            <VpdForm config={config as VpdConfig} onChange={setConfig} />
          )}
          {behaviorType === 'schedule' && (
            <ScheduleForm config={config as ScheduleConfig} onChange={setConfig} />
          )}
          {behaviorType === 'irrigation' && (
            <IrrigationForm config={config as IrrigationConfig} onChange={setConfig} />
          )}
          {behaviorType === 'temperature' && (
            <TemperatureForm config={config as TemperatureConfig} onChange={setConfig} />
          )}
          {behaviorType === 'manual' && (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Sin configuración — el relé se controla manualmente.</div>
          )}

          {/* Node selector — only for sensor-driven types */}
          {needsNode && (
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Nodo sensor</div>
              <select value={nodeId} onChange={e => setNodeId(e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
                <option value="">— Sin nodo —</option>
                {sensorDevices.map(d => (
                  <option key={d.id} value={d.id}>{d.display_name || d.device_id}</option>
                ))}
              </select>
            </div>
          )}

          {saveError && (
            <div style={{ fontSize: 12, color: '#991b1b', background: '#fee2e2', padding: '6px 10px', borderRadius: 4 }}>
              {saveError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              alignSelf: 'flex-start', padding: '6px 18px', borderRadius: 4, border: 'none',
              background: saving ? '#e5e7eb' : '#2563eb',
              color: saving ? '#9ca3af' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}

      {/* Pulse form */}
      {pulseOpen && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 16px', background: '#fffbeb', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Pulso manual</span>
          <input
            type="number" min="1" max="120" value={pulseMins}
            onChange={e => setPulseMins(parseInt(e.target.value))}
            style={{ ...inputStyle, width: 55 }}
          />
          <span style={{ fontSize: 12, color: '#6b7280' }}>min</span>
          <button
            type="button"
            onClick={handlePulse}
            disabled={pulseSending || pulseDone}
            style={{
              padding: '5px 14px', borderRadius: 4, border: 'none',
              background: pulseDone ? '#d1fae5' : pulseSending ? '#e5e7eb' : '#d97706',
              color: pulseDone ? '#065f46' : pulseSending ? '#9ca3af' : '#fff',
              fontSize: 12, fontWeight: 600, cursor: pulseSending ? 'default' : 'pointer',
            }}
          >
            {pulseDone ? '✓ Enviado' : pulseSending ? 'Enviando…' : 'Activar'}
          </button>
          {pulseError && <span style={{ fontSize: 12, color: '#991b1b' }}>{pulseError}</span>}
        </div>
      )}
    </div>
  )
}

const OVERRIDE_OPTIONS: { value: Controller['override_mode']; label: string }[] = [
  { value: 'none',           label: 'Ninguno'        },
  { value: 'temporary_24h', label: 'Temporal 24h'    },
  { value: 'temporary_48h', label: 'Temporal 48h'    },
  { value: 'permanent',     label: 'Permanente'      },
]

// ── Actuator panel ────────────────────────────────────────────────────────────

function ActuatorPanel({ controllerId, siteId, canEdit }: {
  controllerId: string
  siteId: string | null
  canEdit: boolean
}) {
  const { data: actuators, isLoading } = useQuery({
    queryKey: ['controller-actuators', controllerId],
    queryFn: () => getControllerActuators(controllerId),
  })

  const { data: devices } = useQuery({
    queryKey: ['site-devices', siteId],
    queryFn: () => siteId ? getSiteDevices(siteId) : Promise.resolve([]),
    enabled: !!siteId,
  })

  const sensorDevices = (devices ?? []).filter((d: Device) =>
    d.device_type === 'lora_sensor' || d.device_type === 'wifi_sensor'
  )

  if (isLoading) {
    return (
      <div style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>Cargando relés…</div>
    )
  }

  const rows = actuators ?? []

  return (
    <div style={{ padding: '12px 20px 16px', background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
        Relés
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(a => (
          <ActuatorEditRow
            key={a.id}
            controllerId={controllerId}
            actuator={a}
            sensorDevices={sensorDevices}
            canEdit={canEdit}
          />
        ))}
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
