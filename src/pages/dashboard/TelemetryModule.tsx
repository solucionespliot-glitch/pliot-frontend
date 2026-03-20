import { useState } from 'react'
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

type Aggregation = 'raw' | 'hourly' | 'daily'

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatTick(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Annotation label rendered inside SVG ─────────────────────────────────────

interface ViewBox { x: number; y: number; width: number; height: number }

function AnnotationLabel({
  viewBox,
  annotation,
}: {
  viewBox?: ViewBox
  annotation: Annotation
}) {
  const [hovered, setHovered] = useState(false)
  const x = viewBox?.x ?? 0
  const y = viewBox?.y ?? 0
  const height = viewBox?.height ?? 200
  const color = annotation.color ?? '#6366f1'

  return (
    <g>
      {/* Dashed vertical line */}
      <line x1={x} y1={y} x2={x} y2={y + height} stroke={color} strokeWidth={1.5} strokeDasharray="4 2" />
      {/* Clickable marker circle */}
      <circle
        cx={x}
        cy={y + 10}
        r={6}
        fill={color}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {/* Hover tooltip via foreignObject */}
      {hovered && (
        <foreignObject x={x + 10} y={y} width={210} height={72}>
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 700, color: '#111827', marginBottom: 2 }}>{annotation.title}</div>
            <div style={{ color: '#6b7280', lineHeight: 1.4 }}>{annotation.description}</div>
          </div>
        </foreignObject>
      )}
    </g>
  )
}

// ── Shared chart props builder ────────────────────────────────────────────────

function annotationLines(annotations: Annotation[]) {
  return annotations.map(a => (
    <ReferenceLine
      key={a.id}
      x={new Date(a.timestamp).getTime()}
      stroke="transparent"
      label={<AnnotationLabel annotation={a} />}
    />
  ))
}

// ── Chart card ────────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#374151' }}>{title}</h3>
      {children}
    </div>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function TelemetryModule() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const navigate = useNavigate()

  const now = new Date()
  const minus24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [from, setFrom] = useState(toLocalDatetimeValue(minus24h))
  const [to, setTo] = useState(toLocalDatetimeValue(now))
  const [aggregation, setAggregation] = useState<Aggregation>('hourly')

  const params: TelemetryParams = {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    aggregation,
  }

  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ['telemetry', deviceId, params],
    queryFn: () => getDeviceTelemetry(deviceId!, params),
    enabled: !!deviceId,
  })

  const { data: annotations = [] } = useQuery({
    queryKey: ['annotations', deviceId],
    queryFn: () => getAnnotations(deviceId!),
    enabled: !!deviceId,
  })

  // Convert string timestamps to epoch numbers for numeric XAxis (enables ReferenceLine positioning)
  const data = rawData?.map(d => ({ ...d, ts: new Date(d.timestamp).getTime() }))

  const xAxisProps = {
    dataKey: 'ts' as const,
    type: 'number' as const,
    scale: 'time' as const,
    domain: ['dataMin', 'dataMax'] as [string, string],
    tickFormatter: formatTick,
    tick: { fontSize: 11 },
  }

  const labelFormatter = (v: unknown) => new Date(v as number).toLocaleString()

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/dashboard/devices')}
          style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: '#374151' }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>
          {deviceId}
        </h2>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>From</label>
          <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>To</label>
          <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Aggregation</label>
          <select value={aggregation} onChange={e => setAggregation(e.target.value as Aggregation)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}>
            <option value="raw">Raw</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
          </select>
        </div>
      </div>

      {isError && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 20 }}>
          Failed to load telemetry data.
        </div>
      )}

      {isLoading && (
        <div style={{ color: '#6b7280', padding: 32, textAlign: 'center' }}>Loading telemetry...</div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Chart 1: Temperature + Humidity */}
          <ChartCard title="Temperature & Humidity">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data} margin={{ top: 8, right: 32, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis {...xAxisProps} />
                <YAxis yAxisId="temp" unit="°C" tick={{ fontSize: 11 }} width={48} />
                <YAxis yAxisId="hum" orientation="right" unit="%" tick={{ fontSize: 11 }} width={48} />
                <Tooltip labelFormatter={labelFormatter} />
                <Legend />
                {annotationLines(annotations)}
                <Line yAxisId="temp" type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#f97316" dot={false} strokeWidth={2} connectNulls />
                <Line yAxisId="hum" type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#3b82f6" dot={false} strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Chart 2: VPD */}
          <ChartCard title="VPD">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis {...xAxisProps} />
                <YAxis unit=" kPa" tick={{ fontSize: 11 }} width={56} />
                <Tooltip labelFormatter={labelFormatter} />
                <Legend />
                {annotationLines(annotations)}
                <Line type="monotone" dataKey="vpd" name="VPD (kPa)" stroke="#8b5cf6" dot={false} strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Chart 3: Battery voltage */}
          <ChartCard title="Battery Voltage">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis {...xAxisProps} />
                <YAxis unit=" V" tick={{ fontSize: 11 }} width={48} />
                <Tooltip labelFormatter={labelFormatter} />
                <Legend />
                {annotationLines(annotations)}
                <Line type="monotone" dataKey="battery_voltage" name="Battery (V)" stroke="#10b981" dot={false} strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  )
}
