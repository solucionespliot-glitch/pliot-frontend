import { useState } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import {
  getControllers,
  getControllerActuators,
  updateControllerOverride,
  updateActuatorBehavior,
  updateActuatorNodes,
  sendControllerCommand,
  type Controller,
  type Actuator,
  type BehaviorType,
} from '../../services/irrigationService'
import { getSiteDevices, type Device } from '../../services/devicesService'

// ── Style constants ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 13,
  outline: 'none',
  background: 'white',
}

const unitStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280' }

const smallBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 5,
  border: '1px solid #d1d5db',
  fontSize: 12,
  cursor: 'pointer',
  background: 'white',
  color: '#374151',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BEHAVIOR_LABELS: Record<BehaviorType, string> = {
  vpd:         'Nebulización VPD',
  schedule:    'Horario',
  irrigation:  'Riego programado',
  temperature: 'Temperatura',
  manual:      'Manual',
}

// Default config for each behavior type — used when switching types
const DEFAULT_CONFIGS: Record<BehaviorType, Record<string, unknown>> = {
  vpd: {
    vpd_threshold: 0.8,
    on_duration_seconds: 30,
    off_duration_seconds: 120,
    vpd_logic: 'any',
    hysteresis: 0.1,
    stale_timeout_minutes: 15,
  },
  schedule: {
    days: [1, 2, 3, 4, 5],
    windows: [{ on_time: '08:00', off_time: '20:00' }],
  },
  irrigation: {
    days: [1, 2, 3, 4, 5, 6, 7],
    events: [{ time: '08:00', duration_minutes: 20 }],
  },
  temperature: {
    mode: 'heat',
    min_temp: 15,
    max_temp: 25,
    hysteresis: 0.5,
    stale_timeout_minutes: 15,
  },
  manual: {},
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const SYNC_COLORS: Record<Controller['sync_status'], { bg: string; text: string }> = {
  synced:  { bg: '#d1fae5', text: '#065f46' },
  pending: { bg: '#fef3c7', text: '#92400e' },
  error:   { bg: '#fee2e2', text: '#991b1b' },
}

const OVERRIDE_OPTIONS: { value: Controller['override_mode']; label: string }[] = [
  { value: 'none',           label: 'Sin override'    },
  { value: 'temporary_24h', label: 'Temporal 24h'     },
  { value: 'temporary_48h', label: 'Temporal 48h'     },
  { value: 'permanent',     label: 'Permanente'       },
]

function formatHeartbeat(ts: string | null): string {
  if (!ts) return '—'
  const diffMs = Date.now() - new Date(ts).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `${diffMin}m`
  return `${Math.floor(diffMin / 60)}h`
}

// ── Small shared components ───────────────────────────────────────────────────

function SyncBadge({ status }: { status: Controller['sync_status'] }) {
  const { bg, text } = SYNC_COLORS[status]
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color: text }}>
      {status}
    </span>
  )
}

// A label + input row used inside behavior config forms
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ fontSize: 13, color: '#374151', minWidth: 150, paddingTop: 6 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  )
}

// Day selector (Mon–Sun) shared between schedule and irrigation
function DaySelector({
  days,
  onChange,
}: {
  days: number[]
  onChange: (days: number[]) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {DAY_LABELS.map((d, i) => {
        const dayNum = i + 1
        const active = days.includes(dayNum)
        return (
          <button
            key={dayNum}
            type="button"
            onClick={() => onChange(active ? days.filter(x => x !== dayNum) : [...days, dayNum].sort())}
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid',
              borderColor: active ? '#3b82f6' : '#d1d5db',
              background: active ? '#3b82f6' : 'white',
              color: active ? 'white' : '#6b7280',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', lineHeight: 1,
            }}
          >
            {d}
          </button>
        )
      })}
    </div>
  )
}

// ── Behavior config forms ─────────────────────────────────────────────────────

function VpdForm({
  config,
  setConfig,
}: {
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
}) {
  const set = (key: string, value: unknown) => setConfig({ ...config, [key]: value })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormRow label="Umbral VPD">
        <input
          type="number" step="0.1" min="0" max="5"
          value={(config.vpd_threshold as number) ?? 0.8}
          onChange={e => set('vpd_threshold', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>kPa</span>
      </FormRow>
      <FormRow label="Lógica nodos">
        <select
          value={(config.vpd_logic as string) ?? 'any'}
          onChange={e => set('vpd_logic', e.target.value)}
          style={{ ...inputStyle, width: 160 }}
        >
          <option value="any">Cualquiera (any)</option>
          <option value="all">Todos (all)</option>
          <option value="average">Promedio</option>
        </select>
      </FormRow>
      <FormRow label="Histeresis">
        <input
          type="number" step="0.05" min="0" max="2"
          value={(config.hysteresis as number) ?? 0.1}
          onChange={e => set('hysteresis', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>kPa</span>
      </FormRow>
      <FormRow label="Duración ON">
        <input
          type="number" min="1" max="3600"
          value={(config.on_duration_seconds as number) ?? 30}
          onChange={e => set('on_duration_seconds', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>seg</span>
      </FormRow>
      <FormRow label="Duración OFF">
        <input
          type="number" min="1" max="3600"
          value={(config.off_duration_seconds as number) ?? 120}
          onChange={e => set('off_duration_seconds', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>seg</span>
      </FormRow>
      <FormRow label="Dato válido por">
        <input
          type="number" min="1" max="60"
          value={(config.stale_timeout_minutes as number) ?? 15}
          onChange={e => set('stale_timeout_minutes', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>min</span>
      </FormRow>
    </div>
  )
}

function ScheduleForm({
  config,
  setConfig,
}: {
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
}) {
  const days = (config.days as number[]) ?? [1, 2, 3, 4, 5]
  const windows = (config.windows as Array<{ on_time: string; off_time: string }>) ?? [{ on_time: '08:00', off_time: '20:00' }]

  const setWindows = (updated: typeof windows) => setConfig({ ...config, windows: updated })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormRow label="Días activos">
        <DaySelector days={days} onChange={d => setConfig({ ...config, days: d })} />
      </FormRow>
      <FormRow label="Ventanas horarias">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {windows.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={unitStyle}>de</span>
              <input
                type="time" value={w.on_time}
                onChange={e => setWindows(windows.map((w2, j) => j === i ? { ...w2, on_time: e.target.value } : w2))}
                style={{ ...inputStyle, width: 100 }}
              />
              <span style={unitStyle}>a</span>
              <input
                type="time" value={w.off_time}
                onChange={e => setWindows(windows.map((w2, j) => j === i ? { ...w2, off_time: e.target.value } : w2))}
                style={{ ...inputStyle, width: 100 }}
              />
              {windows.length > 1 && (
                <button type="button" onClick={() => setWindows(windows.filter((_, j) => j !== i))}
                  style={{ ...smallBtnStyle, color: '#dc2626', borderColor: '#fca5a5' }}>✕</button>
              )}
            </div>
          ))}
          {windows.length < 10 && (
            <button type="button" onClick={() => setWindows([...windows, { on_time: '08:00', off_time: '20:00' }])}
              style={{ ...smallBtnStyle, alignSelf: 'flex-start', marginTop: 2 }}>+ Ventana</button>
          )}
        </div>
      </FormRow>
    </div>
  )
}

function IrrigationForm({
  config,
  setConfig,
}: {
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
}) {
  const days = (config.days as number[]) ?? [1, 2, 3, 4, 5, 6, 7]
  const events = (config.events as Array<{ time: string; duration_minutes: number }>) ?? [{ time: '08:00', duration_minutes: 20 }]

  const setEvents = (updated: typeof events) => setConfig({ ...config, events: updated })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormRow label="Días activos">
        <DaySelector days={days} onChange={d => setConfig({ ...config, days: d })} />
      </FormRow>
      <FormRow label="Eventos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {events.map((ev, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="time" value={ev.time}
                onChange={e => setEvents(events.map((e2, j) => j === i ? { ...e2, time: e.target.value } : e2))}
                style={{ ...inputStyle, width: 100 }}
              />
              <input
                type="number" min="1" max="1440" value={ev.duration_minutes}
                onChange={e => setEvents(events.map((e2, j) => j === i ? { ...e2, duration_minutes: parseInt(e.target.value) } : e2))}
                style={{ ...inputStyle, width: 64 }}
              />
              <span style={unitStyle}>min</span>
              {events.length > 1 && (
                <button type="button" onClick={() => setEvents(events.filter((_, j) => j !== i))}
                  style={{ ...smallBtnStyle, color: '#dc2626', borderColor: '#fca5a5' }}>✕</button>
              )}
            </div>
          ))}
          {events.length < 20 && (
            <button type="button" onClick={() => setEvents([...events, { time: '08:00', duration_minutes: 20 }])}
              style={{ ...smallBtnStyle, alignSelf: 'flex-start', marginTop: 2 }}>+ Evento</button>
          )}
        </div>
      </FormRow>
    </div>
  )
}

function TemperatureForm({
  config,
  setConfig,
}: {
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
}) {
  const set = (key: string, value: unknown) => setConfig({ ...config, [key]: value })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormRow label="Modo">
        <select
          value={(config.mode as string) ?? 'heat'}
          onChange={e => set('mode', e.target.value)}
          style={{ ...inputStyle, width: 160 }}
        >
          <option value="heat">Calefacción</option>
          <option value="cool">Enfriamiento</option>
        </select>
      </FormRow>
      <FormRow label="Temp. mínima">
        <input
          type="number" step="0.5" min="-20" max="60"
          value={(config.min_temp as number) ?? 15}
          onChange={e => set('min_temp', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Temp. máxima">
        <input
          type="number" step="0.5" min="-20" max="60"
          value={(config.max_temp as number) ?? 25}
          onChange={e => set('max_temp', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Histeresis">
        <input
          type="number" step="0.1" min="0" max="10"
          value={(config.hysteresis as number) ?? 0.5}
          onChange={e => set('hysteresis', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Dato válido por">
        <input
          type="number" min="1" max="60"
          value={(config.stale_timeout_minutes as number) ?? 15}
          onChange={e => set('stale_timeout_minutes', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={unitStyle}>min</span>
      </FormRow>
    </div>
  )
}

function BehaviorConfigForm({
  type,
  config,
  setConfig,
}: {
  type: BehaviorType
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
}) {
  if (type === 'vpd')         return <VpdForm         config={config} setConfig={setConfig} />
  if (type === 'schedule')    return <ScheduleForm    config={config} setConfig={setConfig} />
  if (type === 'irrigation')  return <IrrigationForm  config={config} setConfig={setConfig} />
  if (type === 'temperature') return <TemperatureForm config={config} setConfig={setConfig} />
  // manual
  return (
    <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
      Sin automatización. Use el pulso manual para activar este relé.
    </p>
  )
}

// ── ActuatorCard ──────────────────────────────────────────────────────────────

function ActuatorCard({
  actuator,
  controllerId,
  siteDevices,
}: {
  actuator: Actuator
  controllerId: string
  siteDevices: Device[]
}) {
  const queryClient = useQueryClient()

  // Draft state — user edits locally and clicks Save
  const [draftType, setDraftType]     = useState<BehaviorType>(actuator.behavior_type)
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown>>(
    Object.keys(actuator.behavior_config ?? {}).length > 0
      ? actuator.behavior_config
      : DEFAULT_CONFIGS[actuator.behavior_type],
  )
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(
    actuator.influence_nodes.map(n => n.id),
  )
  const [pulseDuration, setPulseDuration] = useState(5)

  const handleTypeChange = (newType: BehaviorType) => {
    setDraftType(newType)
    // Reset config to defaults when switching type so the form has valid values
    setDraftConfig(DEFAULT_CONFIGS[newType])
  }

  const saveMutation = useMutation({
    mutationFn: () => updateActuatorBehavior(controllerId, actuator.id, draftType, draftConfig),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actuators', controllerId] }),
  })

  const nodesMutation = useMutation({
    mutationFn: () => updateActuatorNodes(controllerId, actuator.id, selectedNodeIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actuators', controllerId] }),
  })

  const pulseMutation = useMutation({
    mutationFn: () => sendControllerCommand(controllerId, {
      command_type: 'pulseRelay',
      relay_index: actuator.relay_index,
      duration_minutes: pulseDuration,
    }),
  })

  // Detect unsaved changes
  const hasBehaviorChanges =
    draftType !== actuator.behavior_type ||
    JSON.stringify(draftConfig) !== JSON.stringify(
      Object.keys(actuator.behavior_config ?? {}).length > 0
        ? actuator.behavior_config
        : DEFAULT_CONFIGS[actuator.behavior_type],
    )

  const hasNodeChanges =
    JSON.stringify([...selectedNodeIds].sort()) !==
    JSON.stringify([...actuator.influence_nodes.map(n => n.id)].sort())

  // Only sensor nodes are valid as influence nodes
  const sensorDevices = siteDevices.filter(
    d => d.device_type === 'lora_sensor' || d.device_type === 'wifi_sensor',
  )

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          background: '#f3f4f6',
          borderRadius: 6,
          padding: '2px 10px',
          fontSize: 12,
          fontWeight: 700,
          color: '#374151',
        }}>
          Re{actuator.relay_index + 1}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{actuator.label}</span>
        {!actuator.enabled && (
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>deshabilitado</span>
        )}
      </div>

      {/* Behavior type selector */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
          COMPORTAMIENTO
        </label>
        <select
          value={draftType}
          onChange={e => handleTypeChange(e.target.value as BehaviorType)}
          style={{ ...inputStyle, width: '100%' }}
        >
          {(Object.keys(BEHAVIOR_LABELS) as BehaviorType[]).map(t => (
            <option key={t} value={t}>{BEHAVIOR_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Config form */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>
          PARÁMETROS
        </label>
        <BehaviorConfigForm type={draftType} config={draftConfig} setConfig={setDraftConfig} />
      </div>

      {/* Save behavior button — only shown when there are unsaved changes */}
      {hasBehaviorChanges && (
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          style={{
            background: '#3b82f6', color: 'white', border: 'none',
            borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', alignSelf: 'flex-start',
          }}
        >
          {saveMutation.isPending ? 'Guardando...' : 'Guardar comportamiento'}
        </button>
      )}
      {saveMutation.isSuccess && !hasBehaviorChanges && (
        <span style={{ fontSize: 12, color: '#16a34a', alignSelf: 'flex-start' }}>✓ Guardado</span>
      )}
      {saveMutation.isError && (
        <span style={{ fontSize: 12, color: '#dc2626', alignSelf: 'flex-start' }}>Error al guardar</span>
      )}

      {/* Influence nodes */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
          NODOS DE INFLUENCIA
        </label>
        {sensorDevices.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
            No hay sensores en este sitio.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {sensorDevices.map(d => {
              const checked = selectedNodeIds.includes(d.id)
              return (
                <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedNodeIds(
                      checked
                        ? selectedNodeIds.filter(id => id !== d.id)
                        : [...selectedNodeIds, d.id],
                    )}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{d.display_name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{d.device_type}</span>
                </label>
              )
            })}
          </div>
        )}
        {hasNodeChanges && (
          <button
            type="button"
            onClick={() => nodesMutation.mutate()}
            disabled={nodesMutation.isPending}
            style={{
              marginTop: 10,
              background: '#f9fafb', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: 6,
              padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {nodesMutation.isPending ? 'Guardando...' : 'Guardar nodos'}
          </button>
        )}
        {nodesMutation.isSuccess && !hasNodeChanges && (
          <span style={{ fontSize: 12, color: '#16a34a', display: 'block', marginTop: 6 }}>✓ Nodos actualizados</span>
        )}
      </div>

      {/* Pulse relay — manual activation */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
          PULSO MANUAL
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number" min="1" max="120"
            value={pulseDuration}
            onChange={e => setPulseDuration(parseInt(e.target.value))}
            style={{ ...inputStyle, width: 64 }}
          />
          <span style={unitStyle}>min</span>
          <button
            type="button"
            onClick={() => pulseMutation.mutate()}
            disabled={pulseMutation.isPending}
            style={{
              background: pulseMutation.isSuccess ? '#d1fae5' : '#f9fafb',
              color: pulseMutation.isSuccess ? '#065f46' : '#374151',
              border: '1px solid',
              borderColor: pulseMutation.isSuccess ? '#a7f3d0' : '#d1d5db',
              borderRadius: 6, padding: '6px 12px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {pulseMutation.isPending ? '...' : pulseMutation.isSuccess ? '✓ Enviado' : 'Enviar pulso'}
          </button>
          {pulseMutation.isError && (
            <span style={{ fontSize: 12, color: '#dc2626' }}>Error al enviar</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ControllerActuatorsPanel ──────────────────────────────────────────────────

function ControllerActuatorsPanel({ controller }: { controller: Controller }) {
  const { data: actuators, isLoading: loadingActuators, isError: errorActuators } = useQuery({
    queryKey: ['actuators', controller.id],
    queryFn: () => getControllerActuators(controller.id),
  })

  const { data: devices, isLoading: loadingDevices } = useQuery({
    queryKey: ['site-devices', controller.site_id],
    queryFn: () => getSiteDevices(controller.site_id),
    enabled: !!controller.site_id,
  })

  const siteDevices = devices ?? []

  if (loadingActuators || loadingDevices) {
    return (
      <div style={{ padding: '20px 0', color: '#6b7280', fontSize: 14 }}>
        Cargando relés...
      </div>
    )
  }

  if (errorActuators) {
    return (
      <div style={{ padding: '12px 0', fontSize: 13, color: '#dc2626' }}>
        Error al cargar los relés.
      </div>
    )
  }

  if (!actuators || actuators.length === 0) {
    return (
      <div style={{ padding: '20px 0', fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
        Este controlador no tiene relés configurados aún.
      </div>
    )
  }

  return (
    <div style={{
      paddingTop: 16,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
      gap: 16,
    }}>
      {actuators.map(a => (
        <ActuatorCard
          key={a.id}
          actuator={a}
          controllerId={controller.id}
          siteDevices={siteDevices}
        />
      ))}
    </div>
  )
}

// ── ControllerRow ─────────────────────────────────────────────────────────────

function ControllerRow({
  controller,
  isExpanded,
  onToggle,
}: {
  controller: Controller
  isExpanded: boolean
  onToggle: () => void
}) {
  const queryClient = useQueryClient()

  const overrideMutation = useMutation({
    mutationFn: (mode: Controller['override_mode']) => updateControllerOverride(controller.id, mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['controllers'] }),
  })

  return (
    <>
      <tr style={{ borderBottom: isExpanded ? '1px solid #e5e7eb' : '1px solid #f3f4f6' }}>
        {/* Name + online indicator */}
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: controller.online ? '#22c55e' : '#d1d5db',
              flexShrink: 0,
            }} />
            <span style={{ fontWeight: 500, color: '#111827' }}>{controller.device_name}</span>
          </div>
        </td>
        <td style={{ padding: '12px 16px' }}>
          <SyncBadge status={controller.sync_status} />
        </td>
        <td style={{ padding: '12px 16px' }}>
          <select
            value={controller.override_mode}
            disabled={overrideMutation.isPending}
            onChange={e => overrideMutation.mutate(e.target.value as Controller['override_mode'])}
            style={{ ...inputStyle, width: 140 }}
          >
            {OVERRIDE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {overrideMutation.isError && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#991b1b' }}>Error</span>
          )}
        </td>
        <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>
          {formatHeartbeat(controller.last_seen_at)}
        </td>
        <td style={{ padding: '12px 16px' }}>
          <button
            type="button"
            onClick={onToggle}
            style={{
              background: isExpanded ? '#f3f4f6' : 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isExpanded ? '▲ Cerrar' : '▼ Relés'}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td
            colSpan={5}
            style={{ padding: '0 16px 20px', background: '#f9fafb' }}
          >
            <ControllerActuatorsPanel controller={controller} />
          </td>
        </tr>
      )}
    </>
  )
}

// ── ControllersModule ─────────────────────────────────────────────────────────

export default function ControllersModule() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    data: controllers,
    isLoading,
    isError,
  } = useQuery({ queryKey: ['controllers'], queryFn: getControllers })

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#111827' }}>Controladores</h2>

      {isError && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 14 }}>
          Error al cargar los controladores.
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Controlador', 'Sync', 'Override', 'Heartbeat', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 2 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} style={{ padding: '12px 16px' }}>
                    <div style={{ height: 14, borderRadius: 4, background: '#e5e7eb', width: j === 0 ? 140 : j === 4 ? 80 : 70 }} />
                  </td>
                ))}
              </tr>
            ))}
            {controllers?.map(c => (
              <ControllerRow
                key={c.id}
                controller={c}
                isExpanded={expandedId === c.id}
                onToggle={() => toggle(c.id)}
              />
            ))}
            {!isLoading && controllers?.length === 0 && (
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
  )
}
