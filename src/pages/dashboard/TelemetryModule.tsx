import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { getDeviceTelemetry, type TelemetryParams } from '../../services/devicesService'
import { getAnnotations, type Annotation } from '../../services/annotationsService'

type ViewMode = 'combined' | 'separated'

// ── Range presets ─────────────────────────────────────────────────────────────

const RANGES = [
  { label: '24 hs', hours: 24 },
  { label: '72 hs', hours: 72 },
  { label: '7 días', hours: 168 },
  { label: '15 días', hours: 360 },
] as const

// ── Variables config ──────────────────────────────────────────────────────────

interface VarConfig {
  key: string
  label: string
  unit: string
  color: string
  icon: string
  yAxisId: string
  orientation: 'left' | 'right'
}

const VARIABLES: VarConfig[] = [
  { key: 'temperature',     label: 'Temperatura', unit: '°C',   color: '#f97316', icon: '/icono-temp.png',     yAxisId: 'temp', orientation: 'left' },
  { key: 'humidity',        label: 'Humedad',      unit: '%',    color: '#3b82f6', icon: '/icono-hum.png',      yAxisId: 'hum',  orientation: 'right' },
  { key: 'light',           label: 'Luz',          unit: ' lux', color: '#eab308', icon: '/icono-luxLevel.png', yAxisId: 'lux',  orientation: 'left' },
  { key: 'vpd',             label: 'DPV',          unit: ' kPa', color: '#8b5cf6', icon: '/icono-dewpoint.png', yAxisId: 'vpd',  orientation: 'right' },
  { key: 'battery_voltage', label: 'Batería',      unit: ' V',   color: '#10b981', icon: '/icono-bucket.png',   yAxisId: 'bat',  orientation: 'left' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatTick(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatTickDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getDate()} ${d.toLocaleString('es', { month: 'short' })} ${String(d.getHours()).padStart(2, '0')}h`
}

function formatRelative(isoTs: string | null | undefined): string {
  if (!isoTs) return '—'
  const diff = Date.now() - new Date(isoTs).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} hs`
  return `hace ${Math.floor(h / 24)} días`
}

// ── Annotation label ──────────────────────────────────────────────────────────

interface ViewBox { x: number; y: number; width: number; height: number }

function AnnotationLabel({ viewBox, annotation }: { viewBox?: ViewBox; annotation: Annotation }) {
  const [hovered, setHovered] = useState(false)
  const x = viewBox?.x ?? 0; const y = viewBox?.y ?? 0; const height = viewBox?.height ?? 200
  const color = annotation.color ?? '#6366f1'
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + height} stroke={color} strokeWidth={1.5} strokeDasharray="4 2" />
      <circle cx={x} cy={y + 10} r={6} fill={color} style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} />
      {hovered && (
        <foreignObject x={x + 10} y={y} width={210} height={72}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.12)', pointerEvents: 'none' }}>
            <div style={{ fontWeight: 700, color: '#111827', marginBottom: 2 }}>{annotation.title}</div>
            <div style={{ color: '#6b7280', lineHeight: 1.4 }}>{annotation.description}</div>
          </div>
        </foreignObject>
      )}
    </g>
  )
}

function annotationLines(annotations: Annotation[]) {
  return annotations.map(a => (
    <ReferenceLine key={a.id} x={new Date(a.timestamp).getTime()} stroke="transparent"
      label={<AnnotationLabel annotation={a} />} />
  ))
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', minWidth: 180 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9ca3af' }}>
        {new Date(label).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </p>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: '#e5e7eb', fontSize: 13 }}>{p.name}:</span>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>
            {p.value != null ? Number(p.value).toFixed(1) : '—'}{p.unit}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Variable toggle button ────────────────────────────────────────────────────

function VarToggle({ v, active, onClick }: { v: VarConfig; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
      borderRadius: 20, border: `2px solid ${active ? v.color : '#d1d5db'}`,
      background: active ? v.color + '18' : '#f9fafb',
      cursor: 'pointer', fontSize: 13, fontWeight: 500,
      color: active ? v.color : '#6b7280', transition: 'all 0.15s',
    }}>
      <img src={v.icon} alt={v.label} style={{ width: 18, height: 18, opacity: active ? 1 : 0.4 }} />
      {v.label}
    </button>
  )
}

// ── Side panel metric card ────────────────────────────────────────────────────

function MetricCard({ v, value }: { v: VarConfig; value: number | null | undefined }) {
  const display = value != null ? Number(value).toFixed(1) : '—'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#fff', border: '1px solid #e6e9f0', borderRadius: 10,
      padding: '10px 14px', minHeight: 64,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{v.label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontSize: 20, fontWeight: 500, color: '#111827' }}>{display}</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#6b7280' }}>{v.unit.trim()}</span>
        </div>
      </div>
      <div style={{ background: '#f9fafb', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <img src={v.icon} alt={v.label} style={{ height: 26, width: 26, objectFit: 'contain' }} />
      </div>
    </div>
  )
}

// ── Chart card ────────────────────────────────────────────────────────────────

function ChartCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon && <img src={icon} alt="" style={{ width: 20, height: 20 }} />}
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#374151' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function TelemetryModule() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const navigate = useNavigate()

  const now = new Date()

  // ── Editing state (inputs) ────────────────────────────────────────────────
  const [from, setFrom] = useState(() => toLocalDatetimeValue(new Date(now.getTime() - 24 * 60 * 60 * 1000)))
  const [to, setTo] = useState(() => toLocalDatetimeValue(now))
  const [selectedHours, setSelectedHours] = useState(24)

  // ── Applied state (what the query actually uses) ──────────────────────────
  const [queryFrom, setQueryFrom] = useState(() => new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
  const [queryTo, setQueryTo]     = useState(() => now.toISOString())

  const [viewMode, setViewMode] = useState<ViewMode>('combined')
  const [activeVars, setActiveVars] = useState<Set<string>>(
    new Set(['temperature', 'humidity', 'light', 'vpd'])
  )

  // Quick range: immediately applies
  function applyRange(hours: number) {
    const t = new Date()
    const f = new Date(t.getTime() - hours * 60 * 60 * 1000)
    setSelectedHours(hours)
    setFrom(toLocalDatetimeValue(f))
    setTo(toLocalDatetimeValue(t))
    setQueryFrom(f.toISOString())
    setQueryTo(t.toISOString())
  }

  // Manual dates: apply only on button click
  function handleApply() {
    setQueryFrom(new Date(from).toISOString())
    setQueryTo(new Date(to).toISOString())
    setSelectedHours(0)
  }

  function toggleVar(key: string) {
    setActiveVars(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  const queryParams: TelemetryParams = { from: queryFrom, to: queryTo, aggregation: 'raw' }

  const { data: rawData, isLoading, isError, isFetching } = useQuery({
    queryKey: ['telemetry', deviceId, queryFrom, queryTo],
    queryFn: () => getDeviceTelemetry(deviceId!, queryParams),
    enabled: !!deviceId,
    refetchOnWindowFocus: false,
  })

  const { data: annotations = [] } = useQuery({
    queryKey: ['annotations', deviceId],
    queryFn: () => getAnnotations(deviceId!),
    enabled: !!deviceId,
  })

  const data = useMemo(
    () => rawData?.map(d => ({ ...d, ts: new Date(d.timestamp).getTime() })),
    [rawData]
  )

  // Latest reading (last data point)
  const latest = data && data.length > 0 ? data[data.length - 1] : null

  const rangeHours = selectedHours > 0
    ? selectedHours
    : (new Date(queryTo).getTime() - new Date(queryFrom).getTime()) / 3_600_000
  const tickFormatter = rangeHours > 72 ? formatTickDay : formatTick

  const xDomain: [number, number] = [
    new Date(queryFrom).getTime(),
    new Date(queryTo).getTime(),
  ]

  const xAxisProps = {
    dataKey: 'ts' as const,
    type: 'number' as const,
    scale: 'time' as const,
    domain: xDomain,
    tickFormatter,
    tick: { fontSize: 11 },
    minTickGap: 40,
  }

  const enabledVars  = VARIABLES.filter(v => activeVars.has(v.key))
  const leftAxes     = enabledVars.filter(v => v.orientation === 'left')
  const rightAxes    = enabledVars.filter(v => v.orientation === 'right')

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/dashboard/devices')}
          style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: '#374151' }}>
          ← Volver
        </button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>
          {deviceId}
        </h2>
        {isFetching && (
          <span style={{ fontSize: 12, color: '#6366f1', marginLeft: 4 }}>● actualizando...</span>
        )}
      </div>

      {/* Main layout: chart area + side panel */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Left: controls + chart */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Controls bar */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>

            {/* Quick range */}
            <div style={{ display: 'flex', gap: 6 }}>
              {RANGES.map(r => (
                <button key={r.hours} onClick={() => applyRange(r.hours)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  border: selectedHours === r.hours ? '2px solid #6366f1' : '1px solid #d1d5db',
                  background: selectedHours === r.hours ? '#6366f118' : '#f9fafb',
                  color: selectedHours === r.hours ? '#6366f1' : '#374151',
                }}>
                  {r.label}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />

            {/* Custom dates */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="datetime-local" value={from} onChange={e => { setFrom(e.target.value); setSelectedHours(0) }}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
              <span style={{ color: '#9ca3af', fontSize: 13 }}>→</span>
              <input type="datetime-local" value={to} onChange={e => { setTo(e.target.value); setSelectedHours(0) }}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
              <button onClick={handleApply} style={{
                padding: '5px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: 'none', background: '#6366f1', color: '#fff',
              }}>
                Buscar
              </button>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(['combined', 'separated'] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  border: viewMode === m ? '2px solid #6366f1' : '1px solid #d1d5db',
                  background: viewMode === m ? '#6366f118' : '#f9fafb',
                  color: viewMode === m ? '#6366f1' : '#374151',
                }}>
                  {m === 'combined' ? '⊞ Combinado' : '⊟ Separado'}
                </button>
              ))}
            </div>
          </div>

          {/* Variable toggles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {VARIABLES.map(v => (
              <VarToggle key={v.key} v={v} active={activeVars.has(v.key)} onClick={() => toggleVar(v.key)} />
            ))}
          </div>

          {/* Data info */}
          {data && (
            <div style={{ fontSize: 12, color: '#9ca3af', paddingLeft: 2 }}>
              {data.length} puntos ·{' '}
              {new Date(queryFrom).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {' → '}
              {new Date(queryTo).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {isError && (
            <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
              Error al cargar datos de telemetría.
            </div>
          )}

          {isLoading && (
            <div style={{ color: '#6b7280', padding: 32, textAlign: 'center' }}>Cargando telemetría...</div>
          )}

          {!isLoading && data?.length === 0 && (
            <div style={{ color: '#9ca3af', padding: 32, textAlign: 'center', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
              Sin datos para el rango seleccionado.
            </div>
          )}

          {data && data.length > 0 && enabledVars.length === 0 && (
            <div style={{ color: '#9ca3af', padding: 32, textAlign: 'center' }}>Seleccioná al menos una variable.</div>
          )}

          {/* Combined chart */}
          {data && data.length > 0 && enabledVars.length > 0 && viewMode === 'combined' && (
            <ChartCard title="Telemetría">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data} margin={{ top: 8, right: 54, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis {...xAxisProps} />
                  {leftAxes.map((v, i) => (
                    <YAxis key={v.yAxisId} yAxisId={v.yAxisId} orientation="left"
                      unit={v.unit} tick={{ fontSize: 11, fill: v.color }} width={52 + i * 6}
                      tickLine={{ stroke: v.color }} axisLine={{ stroke: v.color }} />
                  ))}
                  {rightAxes.map((v, i) => (
                    <YAxis key={v.yAxisId} yAxisId={v.yAxisId} orientation="right"
                      unit={v.unit} tick={{ fontSize: 11, fill: v.color }} width={52 + i * 6}
                      tickLine={{ stroke: v.color }} axisLine={{ stroke: v.color }} />
                  ))}
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(value) => <span style={{ fontSize: 13 }}>{value}</span>} />
                  {annotationLines(annotations)}
                  {enabledVars.map(v => (
                    <Line key={v.key} yAxisId={v.yAxisId} type="monotone" dataKey={v.key}
                      name={v.label} unit={v.unit} stroke={v.color}
                      dot={false} strokeWidth={2} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Separated charts */}
          {data && data.length > 0 && enabledVars.length > 0 && viewMode === 'separated' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {enabledVars.map(v => (
                <ChartCard key={v.key} title={v.label} icon={v.icon}>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis {...xAxisProps} />
                      <YAxis unit={v.unit} tick={{ fontSize: 11, fill: v.color }} width={52}
                        tickLine={{ stroke: v.color }} axisLine={{ stroke: v.color }} />
                      <Tooltip content={<CustomTooltip />} />
                      {annotationLines(annotations)}
                      <Line type="monotone" dataKey={v.key} name={v.label} unit={v.unit}
                        stroke={v.color} dot={false} strokeWidth={2} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              ))}
            </div>
          )}
        </div>

        {/* Right: side panel */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Device header card */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', fontFamily: 'monospace', marginBottom: 6 }}>
              {deviceId}
            </div>
            {latest && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Enlace activo</span>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {formatRelative(latest.timestamp)}
                </div>
              </>
            )}
            {!latest && !isLoading && (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Sin datos</div>
            )}
          </div>

          {/* Metric cards */}
          {VARIABLES.map(v => (
            <MetricCard key={v.key} v={v} value={(latest as any)?.[v.key]} />
          ))}
        </div>
      </div>
    </div>
  )
}
