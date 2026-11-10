import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAlarmRules, createAlarmRule, updateAlarmRule, deleteAlarmRule,
  getAlarmEvents, acknowledgeAlarmEvent,
  type AlarmRule, type CreateAlarmRulePayload,
} from '../../services/alarmsService'
import { getSiteDevices } from '../../services/devicesService'
import { useSiteContext } from '../../hooks/useSiteContext'

// Human-readable labels for metrics and operators
const METRIC_LABELS: Record<string, string> = {
  temperature:      'Temperatura (°C)',
  humidity:         'Humedad (%)',
  vpd:              'DPV (kPa)',
  co2:              'CO₂ (ppm)',
  battery_voltage:  'Batería (V)',
  dew_point:        'Punto de rocío (°C)',
  soil_moisture_cap:'Humedad suelo capacitivo (%)',
  rika_moisture:    'Humedad suelo RIKA (%)',
  soil_temperature: 'Temperatura sustrato (°C)',
}

const OPERATOR_LABELS: Record<string, string> = {
  gt:  'mayor que (>)',
  lt:  'menor que (<)',
  gte: 'mayor o igual (≥)',
  lte: 'menor o igual (≤)',
}

const OPERATOR_SYMBOLS: Record<string, string> = {
  gt: '>', lt: '<', gte: '≥', lte: '≤',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Empty create form state ──────────────────────────────────────────────────

const EMPTY_FORM: CreateAlarmRulePayload = {
  name: '',
  metric: 'temperature',
  operator: 'gt',
  threshold: 0,
  device_id: null,
  cooldown_minutes: 60,
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AlarmsModule() {
  const [tab, setTab] = useState<'events' | 'rules'>('events')

  return (
    <div style={{ padding: '24px 20px', maxWidth: 860, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 20px' }}>Alarmas</h2>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #E5E7EB' }}>
        {(['events', 'rules'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 500,
            color: tab === t ? '#1A7A1A' : '#6B7280',
            borderBottom: tab === t ? '2px solid #2EB82A' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t === 'events' ? 'Eventos' : 'Reglas'}
          </button>
        ))}
      </div>

      {tab === 'events' ? <EventsTab /> : <RulesTab />}
    </div>
  )
}

// ─── Events tab ───────────────────────────────────────────────────────────────

function EventsTab() {
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['alarmEvents', showAll],
    queryFn: () => getAlarmEvents({ active: !showAll, limit: 100 }),
    refetchInterval: 30_000,
  })

  const ackMutation = useMutation({
    mutationFn: acknowledgeAlarmEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarmEvents'] }),
  })

  if (isLoading) return <p style={{ color: '#6B7280', fontSize: 14 }}>Cargando eventos...</p>

  const events = data?.events ?? []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#6B7280' }}>
          {data?.unacked_active ?? 0} activa(s) sin reconocer
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Ver historial completo
        </label>
      </div>

      {events.length === 0 && (
        <p style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 48 }}>
          {showAll ? 'No hay eventos registrados.' : 'No hay alarmas activas.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map(ev => {
          const isActive   = !ev.resolved_at
          const isUnacked  = !ev.acknowledged_at
          const bgColor    = isActive && isUnacked ? '#FEF2F2' : isActive ? '#FFFBEB' : '#F9FAFB'
          const borderColor = isActive && isUnacked ? '#FCA5A5' : isActive ? '#FCD34D' : '#E5E7EB'

          return (
            <div key={ev.id} style={{
              background: bgColor, border: `1px solid ${borderColor}`,
              borderRadius: 10, padding: '14px 16px',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Status badge + rule name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                    background: isActive && isUnacked ? '#FEE2E2' : isActive ? '#FEF3C7' : '#F3F4F6',
                    color:      isActive && isUnacked ? '#DC2626'  : isActive ? '#D97706'  : '#6B7280',
                  }}>
                    {isActive && isUnacked ? 'ACTIVA' : isActive ? 'ACTIVA (vista)' : 'RESUELTA'}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{ev.rule_name}</span>
                </div>

                {/* Detail line */}
                <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                  <strong>{METRIC_LABELS[ev.metric] ?? ev.metric}</strong>
                  {' '}{OPERATOR_SYMBOLS[ev.operator] ?? ev.operator}{' '}
                  <strong>{ev.threshold}</strong>
                  {' · valor: '}
                  <strong style={{ color: isActive ? '#DC2626' : '#374151' }}>
                    {typeof ev.value === 'number' ? ev.value.toFixed(1) : ev.value}
                  </strong>
                </p>

                {/* Device + site + timestamp */}
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9CA3AF' }}>
                  {ev.device_label}
                  {ev.site_name ? ` · ${ev.site_name}` : ''}
                  {' · '}{formatDate(ev.triggered_at)}
                  {ev.resolved_at ? ` → resuelta ${formatDate(ev.resolved_at)}` : ''}
                </p>
              </div>

              {/* Ack button — only for active unacknowledged events */}
              {isActive && isUnacked && (
                <button
                  onClick={() => ackMutation.mutate(ev.id)}
                  disabled={ackMutation.isPending}
                  style={{
                    flexShrink: 0, padding: '6px 12px', borderRadius: 6,
                    border: '1px solid #FCA5A5', background: '#fff',
                    color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Reconocer
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Rules tab ────────────────────────────────────────────────────────────────

function RulesTab() {
  const { siteId } = useSiteContext()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateAlarmRulePayload>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['alarmRules'],
    queryFn: getAlarmRules,
  })

  // Devices for the optional device selector — scoped to current site
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', siteId],
    queryFn: () => getSiteDevices(siteId!),
    enabled: !!siteId,
  })

  // Only sensor devices (not controllers or gateways)
  const sensorDevices = devices.filter(d =>
    d.device_type === 'wifi_sensor' || d.device_type === 'lora_sensor',
  )

  const createMutation = useMutation({
    mutationFn: createAlarmRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alarmRules'] })
      setForm(EMPTY_FORM)
      setShowForm(false)
      setFormError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setFormError(msg ?? 'Error al crear la regla')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateAlarmRule(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarmRules'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAlarmRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarmRules'] }),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return }
    createMutation.mutate(form)
  }

  if (isLoading) return <p style={{ color: '#6B7280', fontSize: 14 }}>Cargando reglas...</p>

  return (
    <div>
      {/* New rule button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => { setShowForm(v => !v); setFormError('') }}
          style={{
            padding: '7px 16px', borderRadius: 7, border: 'none',
            background: showForm ? '#F3F4F6' : '#2EB82A',
            color: showForm ? '#374151' : '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancelar' : '+ Nueva regla'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: '#F9FAFB', border: '1px solid #E5E7EB',
          borderRadius: 10, padding: 20, marginBottom: 20,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>Nueva regla</h3>

          {/* Name */}
          <label style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Nombre
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Temperatura alta invernadero"
              style={inputStyle}
            />
          </label>

          {/* Metric + operator + threshold — same row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 160 }}>
              Métrica
              <select value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))} style={inputStyle}>
                {Object.entries(METRIC_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
              Condición
              <select value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value as 'gt' | 'lt' | 'gte' | 'lte' }))} style={inputStyle}>
                {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 80 }}>
              Umbral
              <input
                type="number" step="any"
                value={form.threshold}
                onChange={e => setForm(f => ({ ...f, threshold: parseFloat(e.target.value) || 0 }))}
                style={inputStyle}
              />
            </label>
          </div>

          {/* Device (optional) */}
          {sensorDevices.length > 0 && (
            <label style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Dispositivo (opcional — vacío = todos los del sitio)
              <select
                value={form.device_id ?? ''}
                onChange={e => setForm(f => ({ ...f, device_id: e.target.value || null }))}
                style={inputStyle}
              >
                <option value="">Todos los dispositivos</option>
                {sensorDevices.map(d => (
                  <option key={d.id} value={d.id}>{d.display_name || d.device_id}</option>
                ))}
              </select>
            </label>
          )}

          {/* Cooldown */}
          <label style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Cooldown (minutos entre re-disparos si no resuelve)
            <input
              type="number" min={1} max={1440}
              value={form.cooldown_minutes}
              onChange={e => setForm(f => ({ ...f, cooldown_minutes: parseInt(e.target.value) || 60 }))}
              style={{ ...inputStyle, maxWidth: 100 }}
            />
          </label>

          {formError && (
            <p style={{ margin: 0, fontSize: 13, color: '#DC2626' }}>{formError}</p>
          )}

          <button type="submit" disabled={createMutation.isPending} style={{
            alignSelf: 'flex-start', padding: '8px 20px', borderRadius: 7, border: 'none',
            background: '#2EB82A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {createMutation.isPending ? 'Guardando...' : 'Crear regla'}
          </button>
        </form>
      )}

      {/* Rules list */}
      {rules.length === 0 && !showForm && (
        <p style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 48 }}>
          No hay reglas configuradas.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rules.map((rule: AlarmRule) => (
          <div key={rule.id} style={{
            background: rule.enabled ? '#fff' : '#F9FAFB',
            border: '1px solid #E5E7EB', borderRadius: 10,
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            opacity: rule.enabled ? 1 : 0.6,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{rule.name}</p>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6B7280' }}>
                {METRIC_LABELS[rule.metric] ?? rule.metric}
                {' '}{OPERATOR_SYMBOLS[rule.operator] ?? rule.operator}{' '}
                {rule.threshold}
                {rule.device_label ? ` · ${rule.device_label}` : ''}
                {rule.site_name ? ` · ${rule.site_name}` : ''}
                {` · cooldown ${rule.cooldown_minutes} min`}
              </p>
            </div>

            {/* Enable toggle */}
            <button
              onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
              disabled={toggleMutation.isPending}
              title={rule.enabled ? 'Desactivar' : 'Activar'}
              style={{
                padding: '5px 12px', borderRadius: 6, border: '1px solid #E5E7EB',
                background: rule.enabled ? '#ECFDF5' : '#F9FAFB',
                color: rule.enabled ? '#059669' : '#9CA3AF',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {rule.enabled ? 'Activa' : 'Inactiva'}
            </button>

            {/* Delete */}
            <button
              onClick={() => {
                if (confirm(`¿Eliminar regla "${rule.name}"?`)) deleteMutation.mutate(rule.id)
              }}
              disabled={deleteMutation.isPending}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid #FCA5A5',
                background: '#fff', color: '#DC2626', fontSize: 12, cursor: 'pointer',
              }}
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, border: '1px solid #D1D5DB',
  fontSize: 13, background: '#fff', color: '#111827', width: '100%',
  boxSizing: 'border-box',
}
