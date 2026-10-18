import { useState, useRef } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { fetchMe } from '../../services/api'
import {
  getControllers,
  getControllerActuators,
  updateControllerOverride,
  updateActuatorBehavior,
  updateActuatorNodes,
  sendControllerCommand,
  patchActuatorLabel,
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

// Contextual explanations shown in the help panel
const BEHAVIOR_HELP: Record<BehaviorType, { title: string; body: string; nodes: string }> = {
  vpd: {
    title: 'Nebulización por VPD',
    body: 'El relé se activa cuando el Déficit de Presión de Vapor (VPD) del ambiente supera el umbral configurado. Un VPD alto indica que el aire está muy seco y puede estresar las plantas. El ciclo es: ON durante "Duración ON", luego OFF durante "Duración OFF", y se repite mientras el VPD siga alto.',
    nodes: 'Los nodos de influencia son los sensores de temperatura y humedad que proveen los datos. Lógica "cualquiera": activa si al menos un nodo supera el umbral. "Todos": requiere que todos lo superen. "Promedio": usa el promedio de todos los nodos. "Tiempo máx. sin dato": si no llega ningún dato nuevo en ese lapso, el relé se detiene (el sensor se considera caído).',
  },
  schedule: {
    title: 'Horario fijo',
    body: 'El relé se activa y desactiva según un horario fijo, sin depender de condiciones ambientales. Se pueden configurar múltiples ventanas horarias por día. Útil para ventilación programada, dosificación periódica o cualquier tarea que deba ocurrir a horas determinadas.',
    nodes: 'Los nodos de influencia no se usan en este modo.',
  },
  irrigation: {
    title: 'Riego programado',
    body: 'El relé activa riegos en días y horarios específicos. Cada evento define la hora de inicio y la duración. Se pueden configurar múltiples eventos por día. Útil para sistemas de riego por goteo o aspersión con tiempos fijos.',
    nodes: 'Los nodos de influencia no se usan en este modo.',
  },
  temperature: {
    title: 'Control de temperatura',
    body: 'El relé mantiene la temperatura dentro del rango configurado. Calefacción: enciende cuando la temperatura cae bajo el mínimo y apaga cuando supera el máximo. Enfriamiento: enciende cuando supera el máximo y apaga cuando cae bajo el mínimo. La histeresis evita que el relé cicle demasiado rápido.',
    nodes: 'Los nodos de influencia deben ser sensores de temperatura. "Tiempo máx. sin dato": si no llega ningún dato nuevo en ese lapso, el relé se detiene por seguridad.',
  },
  manual: {
    title: 'Control manual',
    body: 'El relé solo se activa por comando manual desde el dashboard (botón "Enviar pulso") o desde el portal local del controlador. No hay ningún criterio automático. Útil para pruebas, actuaciones puntuales o mientras se configura el sistema.',
    nodes: 'Los nodos de influencia no se usan en este modo.',
  },
}

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ fontSize: 13, color: '#374151', minWidth: 170, paddingTop: 6 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  )
}

function DaySelector({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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

function VpdForm({ config, setConfig }: { config: Record<string, unknown>; setConfig: (c: Record<string, unknown>) => void }) {
  const set = (key: string, value: unknown) => setConfig({ ...config, [key]: value })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormRow label="Umbral VPD">
        <input type="number" step="0.1" min="0" max="5"
          value={(config.vpd_threshold as number) ?? 0.8}
          onChange={e => set('vpd_threshold', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>kPa</span>
      </FormRow>
      <FormRow label="Lógica nodos">
        <select value={(config.vpd_logic as string) ?? 'any'} onChange={e => set('vpd_logic', e.target.value)} style={{ ...inputStyle, width: 170 }}>
          <option value="any">Cualquiera (any)</option>
          <option value="all">Todos (all)</option>
          <option value="average">Promedio</option>
        </select>
      </FormRow>
      <FormRow label="Histeresis">
        <input type="number" step="0.05" min="0" max="2"
          value={(config.hysteresis as number) ?? 0.1}
          onChange={e => set('hysteresis', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>kPa</span>
      </FormRow>
      <FormRow label="Duración ON">
        <input type="number" min="1" max="3600"
          value={(config.on_duration_seconds as number) ?? 30}
          onChange={e => set('on_duration_seconds', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>seg</span>
      </FormRow>
      <FormRow label="Duración OFF">
        <input type="number" min="1" max="3600"
          value={(config.off_duration_seconds as number) ?? 120}
          onChange={e => set('off_duration_seconds', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>seg</span>
      </FormRow>
      <FormRow label="Tiempo máx. sin dato">
        <input type="number" min="1" max="60"
          value={(config.stale_timeout_minutes as number) ?? 15}
          onChange={e => set('stale_timeout_minutes', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>min</span>
      </FormRow>
    </div>
  )
}

function ScheduleForm({ config, setConfig }: { config: Record<string, unknown>; setConfig: (c: Record<string, unknown>) => void }) {
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
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={unitStyle}>de</span>
              <input type="time" value={w.on_time}
                onChange={e => setWindows(windows.map((w2, j) => j === i ? { ...w2, on_time: e.target.value } : w2))}
                style={{ ...inputStyle, width: 100 }} />
              <span style={unitStyle}>a</span>
              <input type="time" value={w.off_time}
                onChange={e => setWindows(windows.map((w2, j) => j === i ? { ...w2, off_time: e.target.value } : w2))}
                style={{ ...inputStyle, width: 100 }} />
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

function IrrigationForm({ config, setConfig }: { config: Record<string, unknown>; setConfig: (c: Record<string, unknown>) => void }) {
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
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="time" value={ev.time}
                onChange={e => setEvents(events.map((e2, j) => j === i ? { ...e2, time: e.target.value } : e2))}
                style={{ ...inputStyle, width: 100 }} />
              <input type="number" min="1" max="1440" value={ev.duration_minutes}
                onChange={e => setEvents(events.map((e2, j) => j === i ? { ...e2, duration_minutes: parseInt(e.target.value) } : e2))}
                style={{ ...inputStyle, width: 64 }} />
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

function TemperatureForm({ config, setConfig }: { config: Record<string, unknown>; setConfig: (c: Record<string, unknown>) => void }) {
  const set = (key: string, value: unknown) => setConfig({ ...config, [key]: value })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormRow label="Modo">
        <select value={(config.mode as string) ?? 'heat'} onChange={e => set('mode', e.target.value)} style={{ ...inputStyle, width: 170 }}>
          <option value="heat">Calefacción</option>
          <option value="cool">Enfriamiento</option>
        </select>
      </FormRow>
      <FormRow label="Temp. mínima">
        <input type="number" step="0.5" min="-20" max="60"
          value={(config.min_temp as number) ?? 15}
          onChange={e => set('min_temp', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Temp. máxima">
        <input type="number" step="0.5" min="-20" max="60"
          value={(config.max_temp as number) ?? 25}
          onChange={e => set('max_temp', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Histeresis">
        <input type="number" step="0.1" min="0" max="10"
          value={(config.hysteresis as number) ?? 0.5}
          onChange={e => set('hysteresis', parseFloat(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Tiempo máx. sin dato">
        <input type="number" min="1" max="60"
          value={(config.stale_timeout_minutes as number) ?? 15}
          onChange={e => set('stale_timeout_minutes', parseInt(e.target.value))}
          style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>min</span>
      </FormRow>
    </div>
  )
}

function BehaviorConfigForm({ type, config, setConfig }: {
  type: BehaviorType
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
}) {
  if (type === 'vpd')         return <VpdForm         config={config} setConfig={setConfig} />
  if (type === 'schedule')    return <ScheduleForm    config={config} setConfig={setConfig} />
  if (type === 'irrigation')  return <IrrigationForm  config={config} setConfig={setConfig} />
  if (type === 'temperature') return <TemperatureForm config={config} setConfig={setConfig} />
  return (
    <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
      Sin automatización. Use el pulso manual para activar este relé.
    </p>
  )
}

// ── BehaviorHelpCard — contextual documentation at the bottom of the panel ────

function BehaviorHelpCard() {
  const [helpType, setHelpType] = useState<BehaviorType>('vpd')
  const [open, setOpen] = useState(false)
  const help = BEHAVIOR_HELP[helpType]

  return (
    <div style={{
      background: '#f0f9ff',
      border: '1px solid #bae6fd',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 16 }}>?</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0369a1', flex: 1 }}>
          Ayuda — ¿Qué significa cada comportamiento?
        </span>
        <span style={{ fontSize: 12, color: '#0369a1' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#0369a1', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              SELECCIONAR COMPORTAMIENTO
            </label>
            <select
              value={helpType}
              onChange={e => setHelpType(e.target.value as BehaviorType)}
              style={{ ...inputStyle, width: '100%', background: 'white' }}
            >
              {(Object.keys(BEHAVIOR_LABELS) as BehaviorType[]).map(t => (
                <option key={t} value={t}>{BEHAVIOR_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0c4a6e', marginBottom: 8 }}>
              {help.title}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              {help.body}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              <strong>Nodos de influencia:</strong> {help.nodes}
            </p>
          </div>
        </div>
      )}
    </div>
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

  // Draft state for behavior editing
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

  // Inline label editing state
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelValue, setLabelValue]         = useState(actuator.label)
  const labelInputRef = useRef<HTMLInputElement>(null)

  const handleTypeChange = (newType: BehaviorType) => {
    setDraftType(newType)
    setDraftConfig(DEFAULT_CONFIGS[newType])
  }

  const labelMutation = useMutation({
    mutationFn: (label: string) => patchActuatorLabel(controllerId, actuator.id, label),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actuators', controllerId] }),
  })

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

  function commitLabelEdit() {
    const trimmed = labelValue.trim()
    if (!trimmed || trimmed === actuator.label) { setIsEditingLabel(false); return }
    labelMutation.mutate(trimmed, { onSuccess: () => setIsEditingLabel(false) })
  }

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
      {/* Header: relay index + editable label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          background: '#f3f4f6', borderRadius: 6, padding: '2px 10px',
          fontSize: 12, fontWeight: 700, color: '#374151', flexShrink: 0,
        }}>
          Re{actuator.relay_index + 1}
        </span>

        {isEditingLabel ? (
          <input
            ref={labelInputRef}
            value={labelValue}
            onChange={e => setLabelValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitLabelEdit(); if (e.key === 'Escape') setIsEditingLabel(false) }}
            onBlur={commitLabelEdit}
            disabled={labelMutation.isPending}
            style={{ ...inputStyle, flex: 1, fontSize: 14, fontWeight: 600 }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => { setLabelValue(actuator.label); setIsEditingLabel(true); }}
            title="Editar nombre del relé"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: '1px solid transparent', borderRadius: 6,
              padding: '2px 6px', cursor: 'pointer', color: '#111827',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{actuator.label}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}

        {!actuator.enabled && (
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>deshabilitado</span>
        )}
      </div>

      {/* Behavior type selector */}
      <div>
        <SectionLabel>COMPORTAMIENTO</SectionLabel>
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
        <SectionLabel>PARÁMETROS</SectionLabel>
        <BehaviorConfigForm type={draftType} config={draftConfig} setConfig={setDraftConfig} />
      </div>

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
        <span style={{ fontSize: 12, color: '#16a34a' }}>✓ Guardado</span>
      )}
      {saveMutation.isError && (
        <span style={{ fontSize: 12, color: '#dc2626' }}>Error al guardar</span>
      )}

      {/* Influence nodes */}
      <div>
        <SectionLabel>NODOS DE INFLUENCIA</SectionLabel>
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
                      checked ? selectedNodeIds.filter(id => id !== d.id) : [...selectedNodeIds, d.id],
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
              marginTop: 10, background: '#f9fafb', color: '#374151',
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

      {/* Pulse relay */}
      <div>
        <SectionLabel>PULSO MANUAL</SectionLabel>
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
    return <div style={{ padding: '20px 0', color: '#6b7280', fontSize: 14 }}>Cargando relés...</div>
  }

  if (errorActuators) {
    return <div style={{ padding: '12px 0', fontSize: 13, color: '#dc2626' }}>Error al cargar los relés.</div>
  }

  if (!actuators || actuators.length === 0) {
    return (
      <div style={{ padding: '20px 0', fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
        Este controlador no tiene relés configurados aún.
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {actuators.map(a => (
          <ActuatorCard key={a.id} actuator={a} controllerId={controller.id} siteDevices={siteDevices} />
        ))}
      </div>
      <BehaviorHelpCard />
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
              color: '#374151', border: '1px solid #d1d5db',
              borderRadius: 6, padding: '5px 12px',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {isExpanded ? '▲ Cerrar' : '▼ Relés'}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} style={{ padding: '0 16px 20px', background: '#f9fafb' }}>
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

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const isSuperuser = me?.role === 'superuser'
  const hasFeature  = isSuperuser || me?.features?.controllers

  const { data: controllers, isLoading, isError } = useQuery({
    queryKey: ['controllers'],
    queryFn: getControllers,
    enabled: !!hasFeature,
  })

  // If the feature is not enabled for this org, show a friendly message
  if (me && !hasFeature) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
          Módulo de controladores no habilitado
        </div>
        <div style={{ fontSize: 14 }}>
          Este módulo no está activo para tu organización. Contactá a tu administrador de Pliot.
        </div>
      </div>
    )
  }

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
