import { useState, useRef, useEffect } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { fetchMe } from '../../services/api'
import {
  getControllers,
  getControllerActuators,
  updateControllerOverride,
  updateControllerContext,
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

// ── Helpers / constants ───────────────────────────────────────────────────────

const BEHAVIOR_LABELS: Record<BehaviorType, string> = {
  vpd:                'Nebulización VPD',
  schedule:           'Horario',
  irrigation:         'Riego programado',
  temperature:        'Temperatura',
  manual:             'Manual',
  blocked_by_program: 'Controlado por programa',
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// Normalize old flat schedule/irrigation configs to the new multi-group format.
// Old: { days, windows } → New: { groups: [{ days, windows }] }
function normalizeConfig(type: BehaviorType, config: Record<string, unknown>): Record<string, unknown> {
  if (type === 'vpd') {
    const c = { ...config }
    // Rename on_seconds → on_duration_seconds (old DB format)
    if ('on_seconds' in c && !('on_duration_seconds' in c)) {
      c.on_duration_seconds = c.on_seconds
      delete c.on_seconds
    }
    // Rename off_seconds → off_duration_seconds (old DB format)
    if ('off_seconds' in c && !('off_duration_seconds' in c)) {
      c.off_duration_seconds = c.off_seconds
      delete c.off_seconds
    }
    // Extract schedule.from/to → active_window_start/end (old DB format)
    const sched = c.schedule as { from?: string; to?: string } | undefined
    if (sched && !('active_window_start' in c)) {
      if (sched.from) c.active_window_start = sched.from
      if (sched.to)   c.active_window_end   = sched.to
      delete c.schedule
    }
    return c
  }
  if (type === 'schedule') {
    if (Array.isArray((config as Record<string, unknown>).groups)) return config
    return { groups: [{ days: (config.days as number[]) ?? [1, 2, 3, 4, 5], windows: (config.windows as unknown[]) ?? [{ on_time: '08:00', off_time: '20:00' }] }] }
  }
  if (type === 'irrigation') {
    if (Array.isArray((config as Record<string, unknown>).groups)) return config
    return { groups: [{ days: (config.days as number[]) ?? [1, 2, 3, 4, 5, 6, 7], events: (config.events as unknown[]) ?? [{ time: '08:00', duration_minutes: 20 }] }] }
  }
  return config
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
    groups: [{ days: [1, 2, 3, 4, 5], windows: [{ on_time: '08:00', off_time: '20:00' }] }],
  },
  irrigation: {
    groups: [{ days: [1, 2, 3, 4, 5, 6, 7], events: [{ time: '08:00', duration_minutes: 20 }] }],
  },
  temperature: {
    mode: 'heat',
    min_temp: 15,
    max_temp: 25,
    hysteresis: 0.5,
    stale_timeout_minutes: 15,
  },
  manual: {},
  blocked_by_program: {},
}

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

// Contextual explanations for the help card
const BEHAVIOR_HELP: Record<BehaviorType, { title: string; body: string; nodes: string }> = {
  vpd: {
    title: 'Nebulización por VPD',
    body: 'El relé se activa cuando el Déficit de Presión de Vapor (VPD) del ambiente supera el umbral configurado. Un VPD alto indica que el aire está muy seco. El ciclo es: ON durante "Duración ON", luego OFF durante "Duración OFF", y se repite mientras el VPD siga alto. El "Rango horario activo" es opcional: si se activa, el relé solo puede encenderse dentro de ese horario — fuera de él no arranca aunque el VPD supere el umbral.',
    nodes: 'Los nodos de influencia proveen temperatura y humedad. Lógica "cualquiera": activa si al menos un nodo supera el umbral. "Todos": requiere que todos lo superen. "Promedio": usa el promedio. "Tiempo máx. sin dato": si no llega ningún dato en ese lapso, el relé se detiene (sensor considerado caído).',
  },
  schedule: {
    title: 'Horario fijo',
    body: 'El relé se activa y desactiva según un horario fijo, sin depender de condiciones ambientales. Podés configurar múltiples grupos de días, cada uno con sus propias ventanas horarias. Por ejemplo: lunes y miércoles de 8 a 20h, el resto de días de 8 a 10h.',
    nodes: 'Los nodos de influencia no se usan en este modo.',
  },
  irrigation: {
    title: 'Riego programado',
    body: 'El relé activa riegos en días y horarios específicos. Podés configurar múltiples grupos de días, cada uno con sus propios eventos de riego. Por ejemplo: lunes y miércoles con 2 horas de riego, el resto de días con 1 hora.',
    nodes: 'Los nodos de influencia no se usan en este modo.',
  },
  temperature: {
    title: 'Control de temperatura',
    body: 'El relé mantiene la temperatura dentro del rango configurado. Calefacción: enciende cuando la temperatura cae bajo el mínimo y apaga cuando supera el máximo. Enfriamiento: enciende cuando supera el máximo y apaga cuando cae bajo el mínimo. La histeresis evita ciclos rápidos.',
    nodes: 'Los nodos de influencia deben ser sensores de temperatura. "Tiempo máx. sin dato": si no llega ningún dato en ese lapso, el relé se detiene por seguridad.',
  },
  manual: {
    title: 'Control manual',
    body: 'El relé solo se activa por comando manual desde el dashboard (botón "Enviar pulso") o desde el portal local del controlador. No hay automatización. Útil para pruebas o actuaciones puntuales.',
    nodes: 'Los nodos de influencia no se usan en este modo.',
  },
  blocked_by_program: {
    title: 'Controlado por programa de cultivo',
    body: 'Este relé está bajo control del módulo de programa de riego. Los ciclos son determinados automáticamente por el modelo de cultivo activo, calculando la demanda hídrica según la etapa fenológica, temperatura acumulada y coeficiente de cultivo (Kc). La configuración manual está desactivada.',
    nodes: 'Los nodos de influencia se definen en el programa de cultivo asociado a esta zona.',
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
          <button key={dayNum} type="button"
            onClick={() => onChange(active ? days.filter(x => x !== dayNum) : [...days, dayNum].sort())}
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid',
              borderColor: active ? '#3b82f6' : '#d1d5db',
              background: active ? '#3b82f6' : 'white',
              color: active ? 'white' : '#6b7280',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', lineHeight: 1,
            }}
          >{d}</button>
        )
      })}
    </div>
  )
}

// ── Behavior config forms ─────────────────────────────────────────────────────

function VpdForm({ config, setConfig, isCascade }: { config: Record<string, unknown>; setConfig: (c: Record<string, unknown>) => void; isCascade?: boolean }) {
  const set = (key: string, value: unknown) => setConfig({ ...config, [key]: value })

  // Active window is enabled when both fields are present in the config
  const windowEnabled = !!(config.active_window_start || config.active_window_end)

  function toggleWindow(enabled: boolean) {
    if (enabled) {
      setConfig({ ...config, active_window_start: '08:00', active_window_end: '20:00' })
    } else {
      // Remove the window fields from the config
      const { active_window_start: _s, active_window_end: _e, ...rest } = config
      setConfig(rest)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormRow label="Umbral VPD">
        <input type="number" step="0.1" min="0" max="5" value={(config.vpd_threshold as number) ?? 0.8}
          onChange={e => set('vpd_threshold', parseFloat(e.target.value))} style={{ ...inputStyle, width: 80 }} />
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
        <input type="number" step="0.05" min="0" max="2" value={(config.hysteresis as number) ?? 0.1}
          onChange={e => set('hysteresis', parseFloat(e.target.value))} style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>kPa</span>
      </FormRow>
      {/* In cascade mode the cycle timing (on/off seconds) is shared by all VPD relays
          and is configured at the controller level (the "Ciclo cascade" section above the
          relay grid). Hide these fields here to avoid confusion. */}
      {!isCascade && (
        <>
          <FormRow label="Duración ON">
            <input type="number" min="1" max="3600" value={(config.on_duration_seconds as number) ?? 30}
              onChange={e => set('on_duration_seconds', parseInt(e.target.value))} style={{ ...inputStyle, width: 80 }} />
            <span style={unitStyle}>seg</span>
          </FormRow>
          <FormRow label="Duración OFF">
            <input type="number" min="1" max="3600" value={(config.off_duration_seconds as number) ?? 120}
              onChange={e => set('off_duration_seconds', parseInt(e.target.value))} style={{ ...inputStyle, width: 80 }} />
            <span style={unitStyle}>seg</span>
          </FormRow>
        </>
      )}
      <FormRow label="Tiempo máx. sin dato">
        <input type="number" min="1" max="60" value={(config.stale_timeout_minutes as number) ?? 15}
          onChange={e => set('stale_timeout_minutes', parseInt(e.target.value))} style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>min</span>
      </FormRow>

      {/* Optional active time window */}
      <FormRow label="Rango horario activo">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={windowEnabled} onChange={e => toggleWindow(e.target.checked)} />
          <span style={{ fontSize: 13, color: '#374151' }}>Restringir a horario</span>
        </label>
        {windowEnabled && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <span style={unitStyle}>de</span>
            <input type="time" value={(config.active_window_start as string) ?? '08:00'}
              onChange={e => set('active_window_start', e.target.value)} style={{ ...inputStyle, width: 100 }} />
            <span style={unitStyle}>a</span>
            <input type="time" value={(config.active_window_end as string) ?? '20:00'}
              onChange={e => set('active_window_end', e.target.value)} style={{ ...inputStyle, width: 100 }} />
          </div>
        )}
      </FormRow>
    </div>
  )
}

// Schedule day-group: days selector + time windows
type ScheduleGroup = { days: number[]; windows: Array<{ on_time: string; off_time: string }> }

function ScheduleGroupRow({
  group,
  groupIndex,
  totalGroups,
  onChange,
  onRemove,
}: {
  group: ScheduleGroup
  groupIndex: number
  totalGroups: number
  onChange: (g: ScheduleGroup) => void
  onRemove: () => void
}) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.04em' }}>
          GRUPO {groupIndex + 1}
        </span>
        {totalGroups > 1 && (
          <button type="button" onClick={onRemove}
            style={{ ...smallBtnStyle, fontSize: 11, color: '#dc2626', borderColor: '#fca5a5' }}>
            Eliminar
          </button>
        )}
      </div>
      <FormRow label="Días activos">
        <DaySelector days={group.days} onChange={days => onChange({ ...group, days })} />
      </FormRow>
      <FormRow label="Ventanas horarias">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {group.windows.map((w, wi) => (
            <div key={wi} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={unitStyle}>de</span>
              <input type="time" value={w.on_time}
                onChange={e => onChange({ ...group, windows: group.windows.map((w2, j) => j === wi ? { ...w2, on_time: e.target.value } : w2) })}
                style={{ ...inputStyle, width: 100 }} />
              <span style={unitStyle}>a</span>
              <input type="time" value={w.off_time}
                onChange={e => onChange({ ...group, windows: group.windows.map((w2, j) => j === wi ? { ...w2, off_time: e.target.value } : w2) })}
                style={{ ...inputStyle, width: 100 }} />
              {group.windows.length > 1 && (
                <button type="button" onClick={() => onChange({ ...group, windows: group.windows.filter((_, j) => j !== wi) })}
                  style={{ ...smallBtnStyle, color: '#dc2626', borderColor: '#fca5a5' }}>✕</button>
              )}
            </div>
          ))}
          {group.windows.length < 10 && (
            <button type="button" onClick={() => onChange({ ...group, windows: [...group.windows, { on_time: '08:00', off_time: '20:00' }] })}
              style={{ ...smallBtnStyle, alignSelf: 'flex-start' }}>+ Ventana</button>
          )}
        </div>
      </FormRow>
    </div>
  )
}

function ScheduleForm({ config, setConfig }: { config: Record<string, unknown>; setConfig: (c: Record<string, unknown>) => void }) {
  const groups = (config.groups as ScheduleGroup[]) ?? [{ days: [1, 2, 3, 4, 5], windows: [{ on_time: '08:00', off_time: '20:00' }] }]

  const updateGroup = (i: number, g: ScheduleGroup) => setConfig({ groups: groups.map((g2, j) => j === i ? g : g2) })
  const removeGroup = (i: number) => setConfig({ groups: groups.filter((_, j) => j !== i) })
  const addGroup = () => {
    // Default new group to days not already used by existing groups
    const usedDays = groups.flatMap(g => g.days)
    const freeDays = [1, 2, 3, 4, 5, 6, 7].filter(d => !usedDays.includes(d))
    setConfig({ groups: [...groups, { days: freeDays.length > 0 ? freeDays : [1], windows: [{ on_time: '08:00', off_time: '20:00' }] }] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map((g, i) => (
        <ScheduleGroupRow key={i} group={g} groupIndex={i} totalGroups={groups.length}
          onChange={updated => updateGroup(i, updated)} onRemove={() => removeGroup(i)} />
      ))}
      {groups.length < 7 && (
        <button type="button" onClick={addGroup}
          style={{ ...smallBtnStyle, alignSelf: 'flex-start' }}>+ Agregar grupo de días</button>
      )}
    </div>
  )
}

// Irrigation day-group: days selector + timed events
type IrrigationGroup = { days: number[]; events: Array<{ time: string; duration_minutes: number }> }

function IrrigationGroupRow({
  group,
  groupIndex,
  totalGroups,
  onChange,
  onRemove,
}: {
  group: IrrigationGroup
  groupIndex: number
  totalGroups: number
  onChange: (g: IrrigationGroup) => void
  onRemove: () => void
}) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.04em' }}>
          GRUPO {groupIndex + 1}
        </span>
        {totalGroups > 1 && (
          <button type="button" onClick={onRemove}
            style={{ ...smallBtnStyle, fontSize: 11, color: '#dc2626', borderColor: '#fca5a5' }}>
            Eliminar
          </button>
        )}
      </div>
      <FormRow label="Días activos">
        <DaySelector days={group.days} onChange={days => onChange({ ...group, days })} />
      </FormRow>
      <FormRow label="Eventos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {group.events.map((ev, ei) => (
            <div key={ei} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="time" value={ev.time}
                onChange={e => onChange({ ...group, events: group.events.map((e2, j) => j === ei ? { ...e2, time: e.target.value } : e2) })}
                style={{ ...inputStyle, width: 100 }} />
              <input type="number" min="1" max="1440" value={ev.duration_minutes}
                onChange={e => onChange({ ...group, events: group.events.map((e2, j) => j === ei ? { ...e2, duration_minutes: parseInt(e.target.value) } : e2) })}
                style={{ ...inputStyle, width: 64 }} />
              <span style={unitStyle}>min</span>
              {group.events.length > 1 && (
                <button type="button" onClick={() => onChange({ ...group, events: group.events.filter((_, j) => j !== ei) })}
                  style={{ ...smallBtnStyle, color: '#dc2626', borderColor: '#fca5a5' }}>✕</button>
              )}
            </div>
          ))}
          {group.events.length < 20 && (
            <button type="button" onClick={() => onChange({ ...group, events: [...group.events, { time: '08:00', duration_minutes: 20 }] })}
              style={{ ...smallBtnStyle, alignSelf: 'flex-start' }}>+ Evento</button>
          )}
        </div>
      </FormRow>
    </div>
  )
}

function IrrigationForm({ config, setConfig }: { config: Record<string, unknown>; setConfig: (c: Record<string, unknown>) => void }) {
  const groups = (config.groups as IrrigationGroup[]) ?? [{ days: [1, 2, 3, 4, 5, 6, 7], events: [{ time: '08:00', duration_minutes: 20 }] }]

  const updateGroup = (i: number, g: IrrigationGroup) => setConfig({ groups: groups.map((g2, j) => j === i ? g : g2) })
  const removeGroup = (i: number) => setConfig({ groups: groups.filter((_, j) => j !== i) })
  const addGroup = () => {
    const usedDays = groups.flatMap(g => g.days)
    const freeDays = [1, 2, 3, 4, 5, 6, 7].filter(d => !usedDays.includes(d))
    setConfig({ groups: [...groups, { days: freeDays.length > 0 ? freeDays : [1], events: [{ time: '08:00', duration_minutes: 20 }] }] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map((g, i) => (
        <IrrigationGroupRow key={i} group={g} groupIndex={i} totalGroups={groups.length}
          onChange={updated => updateGroup(i, updated)} onRemove={() => removeGroup(i)} />
      ))}
      {groups.length < 7 && (
        <button type="button" onClick={addGroup}
          style={{ ...smallBtnStyle, alignSelf: 'flex-start' }}>+ Agregar grupo de días</button>
      )}
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
        <input type="number" step="0.5" min="-20" max="60" value={(config.min_temp as number) ?? 15}
          onChange={e => set('min_temp', parseFloat(e.target.value))} style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Temp. máxima">
        <input type="number" step="0.5" min="-20" max="60" value={(config.max_temp as number) ?? 25}
          onChange={e => set('max_temp', parseFloat(e.target.value))} style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Histeresis">
        <input type="number" step="0.1" min="0" max="10" value={(config.hysteresis as number) ?? 0.5}
          onChange={e => set('hysteresis', parseFloat(e.target.value))} style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>°C</span>
      </FormRow>
      <FormRow label="Tiempo máx. sin dato">
        <input type="number" min="1" max="60" value={(config.stale_timeout_minutes as number) ?? 15}
          onChange={e => set('stale_timeout_minutes', parseInt(e.target.value))} style={{ ...inputStyle, width: 80 }} />
        <span style={unitStyle}>min</span>
      </FormRow>
    </div>
  )
}

function BehaviorConfigForm({ type, config, setConfig, isCascade }: {
  type: BehaviorType
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
  isCascade?: boolean
}) {
  if (type === 'vpd')         return <VpdForm         config={config} setConfig={setConfig} isCascade={isCascade} />
  if (type === 'schedule')    return <ScheduleForm    config={config} setConfig={setConfig} />
  if (type === 'irrigation')  return <IrrigationForm  config={config} setConfig={setConfig} />
  if (type === 'temperature') return <TemperatureForm config={config} setConfig={setConfig} />
  if (type === 'blocked_by_program') {
    return (
      <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
        Este relé está bajo control del programa de cultivo. La configuración manual no aplica.
      </p>
    )
  }
  // manual
  return (
    <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
      Sin automatización. Use el pulso manual para activar este relé.
    </p>
  )
}

// ── BehaviorHelpCard — styled like an ActuatorCard, shown as the last "relay" ─

function BehaviorHelpCard() {
  const [helpType, setHelpType] = useState<BehaviorType>('vpd')
  const help = BEHAVIOR_HELP[helpType]

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e0e7ff',
      borderRadius: 10,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
    }}>
      {/* Header — same structure as ActuatorCard */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          background: '#e0e7ff', borderRadius: 6, padding: '2px 10px',
          fontSize: 12, fontWeight: 700, color: '#4338ca', flexShrink: 0,
        }}>
          ?
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#4338ca' }}>
          Guía de comportamientos
        </span>
      </div>

      {/* Type selector */}
      <div>
        <SectionLabel>SELECCIONAR TIPO</SectionLabel>
        <select value={helpType} onChange={e => setHelpType(e.target.value as BehaviorType)}
          style={{ ...inputStyle, width: '100%' }}>
          {(Object.keys(BEHAVIOR_LABELS) as BehaviorType[]).map(t => (
            <option key={t} value={t}>{BEHAVIOR_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Help content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e1b4b' }}>{help.title}</div>
        <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{help.body}</p>
        <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          <strong>Nodos de influencia:</strong> {help.nodes}
        </p>
      </div>
    </div>
  )
}

// ── ActuatorCard ──────────────────────────────────────────────────────────────

// Cycle state reported by the firmware in the heartbeat.
// CYCLE_ON: relay physically ON during a VPD/fogger pulse.
// CYCLE_OFF: relay OFF in the rest period between pulses (fogger still active).
// IDLE: no active cycle.
type CycleState = 'IDLE' | 'CYCLE_ON' | 'CYCLE_OFF'

function ActuatorCard({
  actuator,
  controllerId,
  siteDevices,
  relayOn,
  cycleState,
  isCascade,
  isPaused,
}: {
  actuator: Actuator
  controllerId: string
  siteDevices: Device[]
  relayOn: boolean | null
  cycleState: CycleState | null
  isCascade: boolean
  isPaused: boolean
}) {
  const queryClient = useQueryClient()

  // Merge defaults first so required fields are always present, then overlay the
  // normalized DB config. This handles old DB records with missing or renamed fields.
  const initialConfig = Object.keys(actuator.behavior_config ?? {}).length > 0
    ? { ...DEFAULT_CONFIGS[actuator.behavior_type], ...normalizeConfig(actuator.behavior_type, actuator.behavior_config) }
    : DEFAULT_CONFIGS[actuator.behavior_type]

  const [draftType, setDraftType]     = useState<BehaviorType>(actuator.behavior_type)
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown>>(initialConfig)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(actuator.influence_nodes.map(n => n.id))
  const [pulseDuration, setPulseDuration] = useState(5)
  // Optimistic relay state: set locally after pulse/stop so the badge updates
  // immediately without waiting for the next heartbeat + query refetch cycle.
  const [optimisticOn,     setOptimisticOn]     = useState<boolean | null>(null)
  // Optimistic paused state: set locally after pause/resume so the UI responds
  // immediately. The real state comes from last_paused_states in the heartbeat context.
  const [optimisticPaused, setOptimisticPaused] = useState<boolean | null>(null)

  // The firmware reports per-relay cycle states in cascade mode:
  //   CYCLE_ON  → this relay is physically ON right now
  //   CYCLE_OFF → eligible (VPD high, window open) but waiting its turn in the rotation
  //   IDLE      → not eligible (VPD ok, window closed, behavior not vpd)
  //
  // relayActive covers both ON and the waiting phase — showing green in both cases
  // is intentional: a relay that is eligible and in the rotation IS "active" even
  // when it's momentarily OFF between turns. Without this, short ON periods (40s)
  // combined with infrequent heartbeats would almost never show green.
  //
  // displayOn → physical relay state (used for optimistic pulse/stop feedback).
  // relayActive → green border/badge: physically ON OR in cascade rotation.
  const isFoggerBehavior = actuator.behavior_type === 'vpd'
  const displayOn = optimisticOn !== null ? optimisticOn : (relayOn === true)
  const coordinatorActive = isFoggerBehavior && (cycleState === 'CYCLE_ON' || cycleState === 'CYCLE_OFF')
  const relayActive = displayOn || coordinatorActive
  // Paused state: optimistic value takes precedence, then the value from the heartbeat.
  const relayPaused = optimisticPaused !== null ? optimisticPaused : isPaused

  // Per-behavior-type config cache: preserves each type's draft when the user
  // switches away and back, so work-in-progress isn't lost.
  const configCache = useRef<Partial<Record<BehaviorType, Record<string, unknown>>>>({
    [actuator.behavior_type]: initialConfig,
  })

  // Inline label editing
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelValue, setLabelValue]         = useState(actuator.label)
  const labelInputRef = useRef<HTMLInputElement>(null)

  const handleTypeChange = (newType: BehaviorType) => {
    if (newType === draftType) return
    // Warn the user that switching behavior type will discard the current
    // saved configuration when they eventually save.
    const confirmed = window.confirm(
      `¿Cambiar el comportamiento a "${BEHAVIOR_LABELS[newType]}"?\n\nSi guardás, se perderán los parámetros de configuración del comportamiento actual.`
    )
    if (!confirmed) return
    // Save the current draft to the cache before switching away
    configCache.current[draftType] = draftConfig
    setDraftType(newType)
    // Restore the cached config for the new type if available, otherwise use defaults
    setDraftConfig(configCache.current[newType] ?? DEFAULT_CONFIGS[newType])
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
    onSuccess: () => setOptimisticOn(true),
  })

  const stopMutation = useMutation({
    mutationFn: () => sendControllerCommand(controllerId, {
      command_type: 'stopRelay',
      relay_index: actuator.relay_index,
    }),
    onSuccess: () => {
      setOptimisticOn(false)
      setTimeout(() => setOptimisticOn(null), 35_000)
    },
  })

  // Pause: turns relay OFF and blocks all behavior controllers until resumeRelay.
  const pauseMutation = useMutation({
    mutationFn: () => sendControllerCommand(controllerId, {
      command_type: 'pauseRelay',
      relay_index: actuator.relay_index,
    }),
    onSuccess: () => {
      setOptimisticOn(false)
      setOptimisticPaused(true)
    },
  })

  // Resume: re-enables behavior controllers, relay returns to its normal program.
  const resumeMutation = useMutation({
    mutationFn: () => sendControllerCommand(controllerId, {
      command_type: 'resumeRelay',
      relay_index: actuator.relay_index,
    }),
    onSuccess: () => setOptimisticPaused(false),
  })

  function commitLabelEdit() {
    const trimmed = labelValue.trim()
    if (!trimmed || trimmed === actuator.label) { setIsEditingLabel(false); return }
    labelMutation.mutate(trimmed, { onSuccess: () => setIsEditingLabel(false) })
  }

  const savedConfig = Object.keys(actuator.behavior_config ?? {}).length > 0
    ? { ...DEFAULT_CONFIGS[actuator.behavior_type], ...normalizeConfig(actuator.behavior_type, actuator.behavior_config) }
    : DEFAULT_CONFIGS[actuator.behavior_type]

  const hasBehaviorChanges =
    draftType !== actuator.behavior_type ||
    JSON.stringify(draftConfig) !== JSON.stringify(savedConfig)

  const hasNodeChanges =
    JSON.stringify([...selectedNodeIds].sort()) !==
    JSON.stringify([...actuator.influence_nodes.map(n => n.id)].sort())

  const sensorDevices = siteDevices.filter(
    d => d.device_type === 'lora_sensor' || d.device_type === 'wifi_sensor',
  )

  return (
    <div style={{
      background: 'white',
      border: `2px solid ${relayActive ? '#22c55e' : '#e5e7eb'}`,
      borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 18,
      // Subtle green glow when relay is ON or in active cascade rotation
      boxShadow: relayActive ? '0 0 0 3px rgba(34,197,94,0.15)' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ background: '#f3f4f6', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, color: '#374151', flexShrink: 0 }}>
          Re{actuator.relay_index + 1}
        </span>
        {isEditingLabel ? (
          <input ref={labelInputRef} value={labelValue}
            onChange={e => setLabelValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitLabelEdit(); if (e.key === 'Escape') setIsEditingLabel(false) }}
            onBlur={commitLabelEdit}
            disabled={labelMutation.isPending}
            style={{ ...inputStyle, flex: 1, fontSize: 14, fontWeight: 600 }} autoFocus />
        ) : (
          <button type="button" onClick={() => { setLabelValue(actuator.label); setIsEditingLabel(true) }}
            title="Editar nombre del relé"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid transparent', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', color: '#111827' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{actuator.label}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {(displayOn !== null || relayOn !== null || cycleState !== null) && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: relayPaused ? '#fef3c7'
                        : relayActive ? '#dcfce7'
                        :               '#f3f4f6',
              color:      relayPaused ? '#92400e'
                        : relayActive ? '#16a34a'
                        :               '#9ca3af',
            }}>
              {relayPaused       ? 'Pausado'
             : displayOn         ? 'ON'
             : coordinatorActive ? 'Ciclando'
             :                    'OFF'}
            </span>
          )}
          {!actuator.enabled && <span style={{ fontSize: 11, color: '#9ca3af' }}>deshabilitado</span>}
        </span>
      </div>

      {/* Behavior type */}
      <div>
        <SectionLabel>COMPORTAMIENTO</SectionLabel>
        <select value={draftType} onChange={e => handleTypeChange(e.target.value as BehaviorType)} style={{ ...inputStyle, width: '100%' }}>
          {(Object.keys(BEHAVIOR_LABELS) as BehaviorType[]).map(t => (
            <option key={t} value={t}>{BEHAVIOR_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Config form */}
      <div>
        <SectionLabel>PARÁMETROS</SectionLabel>
        <BehaviorConfigForm type={draftType} config={draftConfig} setConfig={setDraftConfig} isCascade={isCascade} />
      </div>

      {hasBehaviorChanges && (
        <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
          {saveMutation.isPending ? 'Guardando...' : 'Guardar comportamiento'}
        </button>
      )}
      {saveMutation.isSuccess && !hasBehaviorChanges && <span style={{ fontSize: 12, color: '#16a34a' }}>✓ Guardado</span>}
      {saveMutation.isError && <span style={{ fontSize: 12, color: '#dc2626' }}>Error al guardar</span>}

      {/* Influence nodes */}
      <div>
        <SectionLabel>NODOS DE INFLUENCIA</SectionLabel>
        {sensorDevices.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>No hay sensores en este sitio.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {sensorDevices.map(d => {
              const checked = selectedNodeIds.includes(d.id)
              return (
                <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked}
                    onChange={() => setSelectedNodeIds(checked ? selectedNodeIds.filter(id => id !== d.id) : [...selectedNodeIds, d.id])} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{d.display_name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{d.device_type}</span>
                </label>
              )
            })}
          </div>
        )}
        {hasNodeChanges && (
          <button type="button" onClick={() => nodesMutation.mutate()} disabled={nodesMutation.isPending}
            style={{ marginTop: 10, background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {nodesMutation.isPending ? 'Guardando...' : 'Guardar nodos'}
          </button>
        )}
        {nodesMutation.isSuccess && !hasNodeChanges && <span style={{ fontSize: 12, color: '#16a34a', display: 'block', marginTop: 6 }}>✓ Nodos actualizados</span>}
      </div>

      {/* Pulse relay */}
      <div>
        <SectionLabel>PULSO MANUAL</SectionLabel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min="1" max="120" value={pulseDuration}
            onChange={e => setPulseDuration(parseInt(e.target.value))} style={{ ...inputStyle, width: 64 }} />
          <span style={unitStyle}>min</span>
          <button type="button" onClick={() => pulseMutation.mutate()} disabled={pulseMutation.isPending || stopMutation.isPending}
            style={{
              background: pulseMutation.isSuccess ? '#d1fae5' : '#f9fafb',
              color: pulseMutation.isSuccess ? '#065f46' : '#374151',
              border: '1px solid', borderColor: pulseMutation.isSuccess ? '#a7f3d0' : '#d1d5db',
              borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            {pulseMutation.isPending ? '...' : pulseMutation.isSuccess ? '✓ Enviado' : 'Enviar pulso'}
          </button>
          {/* Detener: visible when relay is active and not already paused.
              Sends pauseRelay — the program stays suspended until the user resumes. */}
          {relayActive && !relayPaused && (
            <button type="button" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending || pulseMutation.isPending}
              style={{
                background: pauseMutation.isPending ? '#fef3c7' : '#fee2e2',
                color: pauseMutation.isPending ? '#92400e' : '#991b1b',
                border: '1px solid', borderColor: pauseMutation.isPending ? '#fcd34d' : '#fca5a5',
                borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              {pauseMutation.isPending ? '...' : 'Detener'}
            </button>
          )}
          {/* Reanudar: visible when relay is paused. Sends resumeRelay. */}
          {relayPaused && (
            <button type="button" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}
              style={{
                background: resumeMutation.isPending ? '#d1fae5' : '#dcfce7',
                color: resumeMutation.isPending ? '#065f46' : '#15803d',
                border: '1px solid #86efac',
                borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              {resumeMutation.isPending ? '...' : '▶ Reanudar programa'}
            </button>
          )}
          {pulseMutation.isError  && <span style={{ fontSize: 12, color: '#dc2626' }}>Error al enviar</span>}
          {pauseMutation.isError  && <span style={{ fontSize: 12, color: '#dc2626' }}>Error al detener</span>}
          {resumeMutation.isError && <span style={{ fontSize: 12, color: '#dc2626' }}>Error al reanudar</span>}
        </div>
      </div>
    </div>
  )
}

// ── ControllerActuatorsPanel ──────────────────────────────────────────────────

function ControllerActuatorsPanel({ controller }: { controller: Controller }) {
  const queryClient = useQueryClient()

  // Role check — producer and superuser can change relay coordination mode.
  // Uses the cached 'me' query so no extra request is made.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const canEditMode = me?.role === 'producer' || me?.role === 'superuser'

  // Extract relay and cycle states from last heartbeat context
  const relayStates: boolean[] | null =
    Array.isArray(controller.context?.last_relay_states)
      ? (controller.context.last_relay_states as boolean[])
      : null
  const cycleStates: string[] | null =
    Array.isArray(controller.context?.last_cycle_states)
      ? (controller.context.last_cycle_states as string[])
      : null
  const pausedStates: boolean[] | null =
    Array.isArray(controller.context?.last_paused_states)
      ? (controller.context.last_paused_states as boolean[])
      : null

  // Cascade timing — shared by all VPD relays in cascade mode.
  // These values live in controller.context and are sent to the firmware via snapshot.
  // relay_mode defaults to 'cascade' when absent (matches firmware default).
  const ctx = controller.context ?? {}
  const isCascade = (ctx.relay_mode as string | undefined) !== 'independent'
  const ctxOnSec  = (ctx.on_seconds           as number | undefined) ?? 5
  const ctxOffSec = (ctx.off_seconds          as number | undefined) ?? 55
  const [cascadeOnSec,  setCascadeOnSec]  = useState(ctxOnSec)
  const [cascadeOffSec, setCascadeOffSec] = useState(ctxOffSec)

  // Toggle relay coordination mode (cascade ↔ independent).
  // Bumps config_version on the backend so the firmware re-syncs on next heartbeat.
  const relayModeMutation = useMutation({
    mutationFn: (mode: 'cascade' | 'independent') =>
      updateControllerContext(controller.id, { relay_mode: mode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['controllers'] }),
  })

  const cascadeMutation = useMutation({
    mutationFn: () => updateControllerContext(controller.id, {
      on_seconds: cascadeOnSec, off_seconds: cascadeOffSec,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['controllers'] }),
  })

  const hasCascadeChanges = cascadeOnSec !== ctxOnSec || cascadeOffSec !== ctxOffSec

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
    return <div style={{ padding: '20px 0', fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>Este controlador no tiene relés configurados aún.</div>
  }

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Relay coordination mode selector — visible to producer/superuser only.
          Cascade: one pump, solenoids take turns, shared ON/OFF timing.
          Independent: each relay runs its own VPD cycle with its own timing. */}
      {canEditMode && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Modo coordinación:</span>
          <div style={{ display: 'flex', borderRadius: 6, border: '1px solid #d1d5db', overflow: 'hidden' }}>
            {(['cascade', 'independent'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                disabled={relayModeMutation.isPending}
                onClick={() => { if ((isCascade ? 'cascade' : 'independent') !== mode) relayModeMutation.mutate(mode) }}
                style={{
                  padding: '5px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: 'none',
                  cursor: relayModeMutation.isPending ? 'not-allowed' : 'pointer',
                  background: (mode === 'cascade' ? isCascade : !isCascade) ? '#3b82f6' : 'white',
                  color:      (mode === 'cascade' ? isCascade : !isCascade) ? 'white'   : '#374151',
                  transition: 'background 0.15s',
                }}
              >
                {mode === 'cascade' ? 'Cascade' : 'Independiente'}
              </button>
            ))}
          </div>
          {relayModeMutation.isError && <span style={{ fontSize: 12, color: '#dc2626' }}>Error al guardar</span>}
        </div>
      )}

      {/* Cascade timing — only in cascade mode. Shared cycle ON/OFF duration for all VPD
          relays. Stored in controller context, firmware reads it from the snapshot.
          Per-relay VPD forms hide on/off timing in cascade mode to avoid duplicate config. */}
      {isCascade && (
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <SectionLabel>CICLO CASCADE — compartido por todos los relés VPD</SectionLabel>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <FormRow label="Duración ON">
              <input type="number" min="1" max="3600" value={cascadeOnSec}
                onChange={e => setCascadeOnSec(parseInt(e.target.value))} style={{ ...inputStyle, width: 80 }} />
              <span style={unitStyle}>seg</span>
            </FormRow>
            <FormRow label="Duración OFF">
              <input type="number" min="1" max="3600" value={cascadeOffSec}
                onChange={e => setCascadeOffSec(parseInt(e.target.value))} style={{ ...inputStyle, width: 80 }} />
              <span style={unitStyle}>seg</span>
            </FormRow>

            {hasCascadeChanges && (
              <button type="button" onClick={() => cascadeMutation.mutate()} disabled={cascadeMutation.isPending}
                style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {cascadeMutation.isPending ? 'Guardando...' : 'Guardar ciclo'}
              </button>
            )}
            {cascadeMutation.isSuccess && !hasCascadeChanges && <span style={{ fontSize: 12, color: '#16a34a' }}>✓ Guardado</span>}
            {cascadeMutation.isError && <span style={{ fontSize: 12, color: '#dc2626' }}>Error al guardar</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {actuators.map(a => (
          <ActuatorCard
            key={a.id}
            actuator={a}
            controllerId={controller.id}
            siteDevices={siteDevices}
            relayOn={relayStates ? (relayStates[a.relay_index] ?? null) : null}
            cycleState={(cycleStates?.[a.relay_index] as CycleState | undefined) ?? null}
            isCascade={isCascade}
            isPaused={pausedStates ? (pausedStates[a.relay_index] ?? false) : false}
          />
        ))}
        {/* Help card occupies the next grid cell, same aesthetics as relay cards */}
        <BehaviorHelpCard />
      </div>
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
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: controller.online ? '#22c55e' : '#d1d5db', flexShrink: 0 }} />
            <span style={{ fontWeight: 500, color: '#111827' }}>{controller.device_name}</span>
          </div>
        </td>
        <td style={{ padding: '12px 16px' }}><SyncBadge status={controller.sync_status} /></td>
        <td style={{ padding: '12px 16px' }}>
          <select value={controller.override_mode} disabled={overrideMutation.isPending}
            onChange={e => overrideMutation.mutate(e.target.value as Controller['override_mode'])}
            style={{ ...inputStyle, width: 140 }}>
            {OVERRIDE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {overrideMutation.isError && <span style={{ marginLeft: 8, fontSize: 12, color: '#991b1b' }}>Error</span>}
        </td>
        <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>{formatHeartbeat(controller.last_seen_at)}</td>
        <td style={{ padding: '12px 16px' }}>
          <button type="button" onClick={onToggle}
            style={{ background: isExpanded ? '#f3f4f6' : 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
  // Track which controllers are collapsed — default is all expanded
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const isSuperuser = me?.role === 'superuser'
  const hasFeature  = isSuperuser || me?.features?.controllers

  const { data: controllers, isLoading, isError } = useQuery({
    queryKey: ['controllers'],
    queryFn: getControllers,
    enabled: !!hasFeature,
    refetchInterval: 15_000, // refresh every 15s to pick up relay state changes from heartbeats
  })

  // When controllers load, ensure none start as collapsed (all expanded by default)
  useEffect(() => {
    setCollapsedIds(new Set())
  }, [controllers])

  const toggle = (id: string) => setCollapsedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (me && !hasFeature) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Módulo de controladores no habilitado</div>
        <div style={{ fontSize: 14 }}>Este módulo no está activo para tu organización. Contactá a tu administrador de Pliot.</div>
      </div>
    )
  }

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
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
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
                isExpanded={!collapsedIds.has(c.id)}
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
