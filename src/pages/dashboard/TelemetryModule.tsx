import { useState, useMemo, useEffect, useRef } from 'react'
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
  { label: '1 hs',   hours: 1   },
  { label: '24 hs',  hours: 24  },
  { label: '72 hs',  hours: 72  },
  { label: '7 días', hours: 168 },
  { label: '15 días',hours: 360 },
] as const

// ── Variables config ──────────────────────────────────────────────────────────

interface VarConfig {
  key: string
  label: string
  unit: string
  color: string
  icon: string
  iconEl?: React.ReactNode
  yAxisId: string
  orientation: 'left' | 'right'
  domain?: [number | string, number | string]
  sidePanelHidden?: boolean
}

function BatteryIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <line x1="22" y1="11" x2="22" y2="13" strokeWidth="3" />
      <rect x="4" y="9" width="9" height="6" rx="1" fill="#10b981" stroke="none" />
    </svg>
  )
}

function vpdColor(value: number | null | undefined): string {
  if (value == null) return '#9ca3af'
  if (value < 0.2)  return '#ef4444'  // rojo — muy bajo
  if (value <= 1.2) return '#22c55e'  // verde — óptimo
  if (value <= 2.0) return '#facc15'  // amarillo — alto
  return '#ef4444'                     // rojo — muy alto
}

function vpdLabel(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value < 0.2)  return 'Muy bajo'
  if (value <= 1.2) return 'Óptimo'
  if (value <= 2.0) return 'Alto'
  return 'Muy alto'
}

const VARIABLES: VarConfig[] = [
  { key: 'temperature',     label: 'Temperatura',  unit: '°C',          color: '#f97316', icon: '/icono-temp.png',     yAxisId: 'temp', orientation: 'left' },
  { key: 'humidity',        label: 'Humedad',       unit: '%',           color: '#3b82f6', icon: '/icono-hum.png',      yAxisId: 'hum',  orientation: 'right', domain: [0, 100] },
  { key: 'light',           label: 'Luz',           unit: ' lux',        color: '#facc15', icon: '/icono-luxLevel.png', yAxisId: 'lux',  orientation: 'left' },
  { key: 'dew_point',       label: 'Pto. Rocío',    unit: '°C',          color: '#06b6d4', icon: '/icono-dewpoint.png', yAxisId: 'dew',  orientation: 'right' },
  { key: 'vpd',             label: 'DPV',           unit: ' kPa',        color: '#8b5cf6', icon: '/icono-dewpoint.png', yAxisId: 'vpd',  orientation: 'left',  domain: [0, 15], sidePanelHidden: true },
  { key: 'battery_voltage', label: 'Batería',       unit: ' V',          color: '#10b981', icon: '',                    iconEl: <BatteryIcon />, yAxisId: 'bat', orientation: 'right' },
  // Optional sensors — only some node types report these
  { key: 'co2',             label: 'CO₂',           unit: ' ppm',        color: '#78716c', icon: '/icono-co2.png',      yAxisId: 'co2',  orientation: 'left' },
  { key: 'ppfd',            label: 'PPFD',          unit: ' µmol/m²·s',  color: '#fb923c', icon: '/icono-luxLevel.png', yAxisId: 'ppfd', orientation: 'right' },
  { key: 'soil_temperature',  label: 'T° sustrato',   unit: '°C',      color: '#a16207', icon: '/icono-temp.png',     yAxisId: 'soilt',  orientation: 'left' },
  { key: 'ph',               label: 'pH',            unit: '',         color: '#a78bfa', icon: '/icono-dewpoint.png', yAxisId: 'ph',     orientation: 'right' },
  { key: 'ec',               label: 'EC',            unit: ' mS/cm',   color: '#34d399', icon: '/icono-dewpoint.png', yAxisId: 'ec',     orientation: 'left' },
  // Capacitive soil moisture sensor (FSN-703-olmo)
  { key: 'soil_moisture_cap', label: 'Hum. suelo',   unit: '%',        color: '#92400e', icon: '/icono-hum.png',      yAxisId: 'smcap',  orientation: 'right', domain: [0, 100] },
  { key: 'soil_temp_cap',     label: 'T° suelo',     unit: '°C',       color: '#78350f', icon: '/icono-temp.png',     yAxisId: 'stcap',  orientation: 'left' },
  // RIKA NPK 7-in-1 sensor (olmov-FSN-702)
  { key: 'rika_moisture',     label: 'Hum. suelo R', unit: '%',        color: '#b45309', icon: '/icono-hum.png',      yAxisId: 'rmoist', orientation: 'right', domain: [0, 100] },
  { key: 'rika_temperature',  label: 'T° suelo R',   unit: '°C',       color: '#92400e', icon: '/icono-temp.png',     yAxisId: 'rtemp',  orientation: 'left' },
  { key: 'rika_ec',           label: 'EC suelo',     unit: ' mS/cm',   color: '#059669', icon: '/icono-dewpoint.png', yAxisId: 'rec',    orientation: 'right' },
  { key: 'rika_ph',           label: 'pH suelo',     unit: '',         color: '#7c3aed', icon: '/icono-dewpoint.png', yAxisId: 'rph',    orientation: 'left' },
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

  // Deduplicate VPD segments — show only the first non-null entry named "DPV"
  const seen = new Set<string>()
  const filtered = payload.filter((p: any) => {
    if (seen.has(p.name)) return false
    seen.add(p.name)
    return true
  })

  return (
    <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', minWidth: 180 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9ca3af' }}>
        {new Date(label).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </p>
      {filtered.map((p: any) => (
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

// ── Variable toggle button (with latest value) ───────────────────────────────

function VarToggle({ v, active, onClick, latestValue }: { v: VarConfig; active: boolean; onClick: () => void; latestValue?: number | null }) {
  const display = latestValue != null ? Number(latestValue).toFixed(1) : '—'
  const isVpd = v.key === 'vpd'
  const valueColor = isVpd ? vpdColor(latestValue) : (active ? v.color : '#374151')

  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '10px 14px', minWidth: 88,
      borderRadius: 10, border: `2px solid ${active ? v.color : '#d1d5db'}`,
      background: active ? v.color + '18' : '#f9fafb',
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <div style={{ opacity: active ? 1 : 0.4 }}>
        {v.iconEl ?? <img src={v.icon} alt={v.label} style={{ width: 26, height: 26, objectFit: 'contain' }} />}
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, color: active ? v.color : '#6b7280' }}>{v.label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: valueColor }}>
        {display}<span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>{latestValue != null ? v.unit.trim() : ''}</span>
      </span>
      {isVpd && latestValue != null && (
        <span style={{ fontSize: 10, fontWeight: 600, color: vpdColor(latestValue) }}>{vpdLabel(latestValue)}</span>
      )}
    </button>
  )
}

// ── Chart card ────────────────────────────────────────────────────────────────

function ChartCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--p-surface)', borderRadius: 'var(--p-radius-card)', border: '1px solid var(--p-border)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon && <img src={icon} alt="" style={{ width: 20, height: 20 }} />}
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--p-text-secondary)' }}>{title}</h3>
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

  // Default to separated on mobile so the chart fits without horizontal overflow
  const [viewMode, setViewMode] = useState<ViewMode>(() => window.innerWidth < 640 ? 'separated' : 'combined')
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

  const data = useMemo(() => {
    if (!rawData) return undefined
    return rawData.map((d, i, arr) => {
      const base = { ...d, ts: new Date(d.timestamp).getTime() }
      const vpd = d.vpd as number | null | undefined
      let vpd_green: number | null = null
      let vpd_yellow: number | null = null
      let vpd_red: number | null = null

      if (vpd != null) {
        const col = vpdColor(vpd)
        if (col === '#22c55e') vpd_green = vpd
        else if (col === '#facc15') vpd_yellow = vpd
        else vpd_red = vpd

        // At color boundaries include this point in the adjacent segment too,
        // so the two segments connect without a gap.
        const prevVpd = arr[i - 1]?.vpd as number | null | undefined
        const nextVpd = arr[i + 1]?.vpd as number | null | undefined

        if (prevVpd != null && vpdColor(prevVpd) !== col) {
          const pc = vpdColor(prevVpd)
          if (pc === '#22c55e') vpd_green = vpd
          else if (pc === '#facc15') vpd_yellow = vpd
          else vpd_red = vpd
        }
        if (nextVpd != null && vpdColor(nextVpd) !== col) {
          const nc = vpdColor(nextVpd)
          if (nc === '#22c55e') vpd_green = vpd
          else if (nc === '#facc15') vpd_yellow = vpd
          else vpd_red = vpd
        }
      }

      return { ...base, vpd_green, vpd_yellow, vpd_red }
    })
  }, [rawData])

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

  // ── Mobile detection for responsive chart layout ──────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // ── Wheel zoom state ──────────────────────────────────────────────────────
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null)
  const chartWrapperRef = useRef<HTMLDivElement>(null)

  // Reset zoom whenever the query range changes
  useEffect(() => { setZoomDomain(null) }, [queryFrom, queryTo])

  const effectiveDomain: [number, number] = zoomDomain ?? xDomain

  // Refs para que el handler siempre lea los valores actuales sin stale closure
  const zoomDomainRef = useRef<[number, number] | null>(null)
  const xDomainRef    = useRef<[number, number]>(xDomain)
  zoomDomainRef.current = zoomDomain
  xDomainRef.current    = xDomain

  const handleWheelRef = useRef<(e: WheelEvent) => void>(() => {})
  handleWheelRef.current = (e: WheelEvent) => {
    e.preventDefault()
    const [start, end] = zoomDomainRef.current ?? xDomainRef.current
    const span   = end - start
    const center = (start + end) / 2
    const factor = e.deltaY > 0 ? 2.5 : 0.4   // scroll down = zoom out, up = zoom in
    const newSpan = Math.min(
      Math.max(span * factor, 30 * 60 * 1000), // min 30 min
      xDomainRef.current[1] - xDomainRef.current[0],
    )
    let s = center - newSpan / 2
    let t = center + newSpan / 2
    if (s < xDomainRef.current[0]) { s = xDomainRef.current[0]; t = s + newSpan }
    if (t > xDomainRef.current[1]) { t = xDomainRef.current[1]; s = t - newSpan }
    setZoomDomain([s, t])
  }

  // Registro estable: el listener apunta siempre al ref, nunca se re-registra
  useEffect(() => {
    const el = chartWrapperRef.current
    if (!el) return
    const handler = (e: WheelEvent) => handleWheelRef.current(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const xAxisProps = {
    dataKey: 'ts' as const,
    type: 'number' as const,
    scale: 'time' as const,
    domain: effectiveDomain,
    tickFormatter,
    tick: { fontSize: 11 },
    minTickGap: 40,
  }

  // Only show variables that this device actually reports (have at least one non-null value)
  const availableVars = useMemo(() => {
    if (!data || data.length === 0) return VARIABLES
    return VARIABLES.filter(v => data.some(d => (d as any)[v.key] != null))
  }, [data])

  const enabledVars  = availableVars.filter(v => activeVars.has(v.key))
  const leftAxes     = enabledVars.filter(v => v.orientation === 'left')
  const rightAxes    = enabledVars.filter(v => v.orientation === 'right')

  return (
    <div style={{ padding: '20px 20px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/dashboard/devices')}
          style={{ background: 'none', border: '1px solid var(--p-border)', borderRadius: 'var(--p-radius-btn)', padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: 'var(--p-text-secondary)' }}>
          ← Volver
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--p-text)' }}>
          {deviceId}
        </h2>
        {latest && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Enlace activo</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>· {formatRelative(latest.timestamp)}</span>
            </span>
            {(latest as any).vpd != null && (() => {
              const vpd = (latest as any).vpd as number
              const col = vpdColor(vpd)
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: col + '18', borderRadius: 8, padding: '4px 10px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: col, display: 'inline-block' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: col }}>DPV: {Number(vpd).toFixed(2)} kPa</span>
                  <span style={{ fontSize: 12, color: col }}>{vpdLabel(vpd)}</span>
                </span>
              )
            })()}
          </>
        )}
        {isFetching && (
          <span style={{ fontSize: 12, color: 'var(--p-primary)', marginLeft: 4 }}>● actualizando...</span>
        )}
      </div>

      {/* Main layout: full width */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Chart area — full width */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Controls bar */}
          <div style={{ background: 'var(--p-surface)', borderRadius: 'var(--p-radius-card)', border: '1px solid var(--p-border)', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>

            {/* Quick range — nowrap so buttons stay on a single line on mobile */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto' }}>
              {RANGES.map(r => (
                <button key={r.hours} onClick={() => applyRange(r.hours)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  border: selectedHours === r.hours ? `2px solid var(--p-primary)` : '1px solid var(--p-border)',
                  background: selectedHours === r.hours ? '#2EB82A18' : 'var(--p-bg)',
                  color: selectedHours === r.hours ? 'var(--p-primary-dark)' : 'var(--p-text-secondary)',
                }}>
                  {r.label}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 24, background: 'var(--p-border)' }} />

            {/* Custom dates */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="datetime-local" value={from} onChange={e => { setFrom(e.target.value); setSelectedHours(0) }}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--p-border)', fontSize: 13, color: 'var(--p-text)', background: 'var(--p-bg)' }} />
              <span style={{ color: 'var(--p-text-muted)', fontSize: 13 }}>→</span>
              <input type="datetime-local" value={to} onChange={e => { setTo(e.target.value); setSelectedHours(0) }}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--p-border)', fontSize: 13, color: 'var(--p-text)', background: 'var(--p-bg)' }} />
              <button onClick={handleApply} style={{
                padding: '5px 16px', borderRadius: 'var(--p-radius-btn)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: 'none', background: 'var(--p-primary)', color: '#fff',
              }}>
                Buscar
              </button>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(['combined', 'separated'] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  border: viewMode === m ? `2px solid var(--p-primary)` : '1px solid var(--p-border)',
                  background: viewMode === m ? '#2EB82A18' : 'var(--p-bg)',
                  color: viewMode === m ? 'var(--p-primary-dark)' : 'var(--p-text-secondary)',
                }}>
                  {m === 'combined' ? '⊞ Combinado' : '⊟ Separado'}
                </button>
              ))}
            </div>
          </div>

          {/* Variable toggles — only for sensors this device actually reports */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {availableVars.map(v => (
              <VarToggle key={v.key} v={v} active={activeVars.has(v.key)} onClick={() => toggleVar(v.key)}
                latestValue={(latest as any)?.[v.key]} />
            ))}
          </div>

          {/* Data info */}
          {data && (
            <div style={{ fontSize: 12, color: 'var(--p-text-muted)', paddingLeft: 2 }}>
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
            <div style={{ color: 'var(--p-text-secondary)', padding: 32, textAlign: 'center' }}>Cargando telemetría...</div>
          )}

          {!isLoading && data?.length === 0 && (
            <div style={{ color: 'var(--p-text-muted)', padding: 32, textAlign: 'center', background: 'var(--p-surface)', borderRadius: 'var(--p-radius-card)', border: '1px solid var(--p-border)' }}>
              Sin datos para el rango seleccionado.
            </div>
          )}

          {data && data.length > 0 && enabledVars.length === 0 && (
            <div style={{ color: 'var(--p-text-muted)', padding: 32, textAlign: 'center' }}>Seleccioná al menos una variable.</div>
          )}

          {/* Combined chart */}
          {data && data.length > 0 && enabledVars.length > 0 && viewMode === 'combined' && (
            <ChartCard title="Telemetría">
              <div ref={chartWrapperRef} style={{ userSelect: 'none' }}>
              <ResponsiveContainer width="100%" height={isMobile ? 280 : 500}>
                <LineChart data={data} margin={{ top: 8, right: isMobile ? 8 : 96, left: isMobile ? 4 : 48, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis {...xAxisProps} />
                  {leftAxes.map((v) => (
                    <YAxis key={v.yAxisId} yAxisId={v.yAxisId} orientation="left"
                      domain={v.domain ?? ['auto', 'auto']}
                      unit={v.unit} tick={{ fontSize: 10, fill: v.color }} width={isMobile ? 28 : 48}
                      tickLine={{ stroke: v.color }} axisLine={{ stroke: 'var(--p-border)' }} />
                  ))}
                  {rightAxes.map((v) => (
                    <YAxis key={v.yAxisId} yAxisId={v.yAxisId} orientation="right"
                      domain={v.domain ?? ['auto', 'auto']}
                      unit={v.unit} tick={{ fontSize: 10, fill: v.color }} width={isMobile ? 28 : 48}
                      tickLine={{ stroke: v.color }} axisLine={{ stroke: 'var(--p-border)' }} />
                  ))}
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(value) => <span style={{ fontSize: 13 }}>{value}</span>} />
                  {annotationLines(annotations)}
                  {enabledVars.map(v => v.key === 'vpd' ? null : (
                    <Line key={v.key} yAxisId={v.yAxisId} type="monotone" dataKey={v.key}
                      name={v.label} unit={v.unit} stroke={v.color}
                      dot={false} strokeWidth={2} connectNulls />
                  ))}
                  {activeVars.has('vpd') && <>
                    <Line key="vpd_green"  dataKey="vpd_green"  yAxisId="vpd" type="monotone" name="DPV" unit=" kPa" stroke="#22c55e" dot={false} strokeWidth={2} connectNulls={false} legendType="none" />
                    <Line key="vpd_yellow" dataKey="vpd_yellow" yAxisId="vpd" type="monotone" name="DPV" unit=" kPa" stroke="#facc15" dot={false} strokeWidth={2} connectNulls={false} legendType="none" />
                    <Line key="vpd_red"    dataKey="vpd_red"    yAxisId="vpd" type="monotone" name="DPV" unit=" kPa" stroke="#ef4444" dot={false} strokeWidth={2} connectNulls={false} legendType="none" />
                  </>}
                </LineChart>
              </ResponsiveContainer>
              </div>
            </ChartCard>
          )}

          {/* Separated charts */}
          {data && data.length > 0 && enabledVars.length > 0 && viewMode === 'separated' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {enabledVars.map(v => (
                <ChartCard key={v.key} title={v.label} icon={v.icon}>
                  <ResponsiveContainer width="100%" height={isMobile ? 160 : 180}>
                    <LineChart data={data} margin={{ top: 4, right: isMobile ? 8 : 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis {...xAxisProps} />
                      <YAxis unit={v.unit} tick={{ fontSize: 11, fill: v.color }} width={isMobile ? 32 : 52}
                        domain={v.domain ?? ['auto', 'auto']}
                        tickLine={{ stroke: v.color }} axisLine={{ stroke: '#e5e7eb' }} />
                      <Tooltip content={<CustomTooltip />} />
                      {annotationLines(annotations)}
                      {v.key === 'vpd' ? <>
                        <Line dataKey="vpd_green"  type="monotone" name="DPV" unit=" kPa" stroke="#22c55e" dot={false} strokeWidth={2} connectNulls={false} legendType="none" />
                        <Line dataKey="vpd_yellow" type="monotone" name="DPV" unit=" kPa" stroke="#facc15" dot={false} strokeWidth={2} connectNulls={false} legendType="none" />
                        <Line dataKey="vpd_red"    type="monotone" name="DPV" unit=" kPa" stroke="#ef4444" dot={false} strokeWidth={2} connectNulls={false} legendType="none" />
                      </> : (
                        <Line type="monotone" dataKey={v.key} name={v.label} unit={v.unit}
                          stroke={v.color} dot={false} strokeWidth={2} connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
