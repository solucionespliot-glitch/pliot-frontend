import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSiteContext } from '../../hooks/useSiteContext'
import { getSiteDevices, type Device } from '../../services/devicesService'

function getStatus(device: Device): 'online' | 'warning' | 'offline' {
  if (!device.last_seen_at) return 'offline'
  const diffMs = Date.now() - new Date(device.last_seen_at).getTime()
  const diffMin = diffMs / 60000
  if (diffMin < 30) return 'online'
  if (diffMin < 120) return 'warning'
  return 'offline'
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'Sin datos'
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH}h`
  return `Hace ${Math.floor(diffH / 24)}d`
}

const STATUS_LABEL: Record<string, string> = {
  online:  'Online',
  warning: 'Regular',
  offline: 'Offline',
}
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  online:  { bg: '#DCFCE7', text: '#16A34A' },
  warning: { bg: '#FEF9C3', text: '#CA8A04' },
  offline: { bg: '#FEE2E2', text: '#DC2626' },
}

function fmt1(v: number | null) { return v != null ? Number(v).toFixed(1) : '—' }
function fmt2(v: number | null) { return v != null ? Number(v).toFixed(2) : '—' }

function MetricCell({ icon, label, value, unit, color }: {
  icon: string; label: string; value: string; unit: string; color: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--p-text-muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
        <img src={icon} alt="" style={{ width: 13, height: 13, opacity: 0.7 }} />
        {label}
      </span>
      <span style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--p-text-secondary)', marginLeft: 2 }}>{value !== '—' ? unit : ''}</span>
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="device-card device-card--offline" style={{ padding: 16 }}>
      {[80, 120, 60].map((w, i) => (
        <div key={i} style={{ height: i === 1 ? 20 : 14, borderRadius: 4, background: '#E5E7EB', width: w, marginBottom: 10 }} />
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 36, borderRadius: 4, background: '#F3F4F6' }} />
        ))}
      </div>
    </div>
  )
}

function DeviceCard({ device, onClick }: { device: Device; onClick: () => void }) {
  const status = getStatus(device)
  const { bg, text } = STATUS_COLORS[status]

  return (
    <div className={`device-card device-card--${status}`} onClick={onClick}>
      {/* Header */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--p-border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--p-text)', lineHeight: 1.2 }}>
            {device.display_name || device.device_id}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--p-radius-badge)', background: bg, color: text, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--p-text-muted)' }}>
          {device.device_id}{device.zone_name ? ` · ${device.zone_name}` : ''}
        </div>
      </div>

      {/* Telemetry grid — base sensors always shown */}
      <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
        <MetricCell icon="/icono-temp.png"     label="Temperatura" value={fmt1(device.temperature)}    unit="°C"   color="var(--p-temp)"  />
        <MetricCell icon="/icono-hum.png"      label="Humedad"     value={fmt1(device.humidity)}       unit="%"    color="var(--p-hum)"   />
        <MetricCell icon="/icono-luxLevel.png" label="Luz"         value={fmt1(device.light)}          unit=" lux" color="var(--p-light)" />
        <MetricCell icon="/icono-dewpoint.png" label="DPV"         value={fmt2(device.vpd)}            unit=" kPa" color="var(--p-vpd)"   />

        {/* Optional sensors — only rendered if device has reported them at least once */}
        {device.sensor_capabilities?.co2           && <MetricCell icon="/icono-co2.png"    label="CO₂"          value={fmt1(device.co2)}            unit=" ppm"        color="var(--p-co2)"  />}
        {device.sensor_capabilities?.ppfd          && <MetricCell icon="/icono-luxLevel.png" label="PPFD"       value={fmt1(device.ppfd)}           unit=" µmol/m²·s"  color="var(--p-light)" />}
        {device.sensor_capabilities?.ph            && <MetricCell icon="/icono-dewpoint.png" label="pH"         value={fmt2(device.ph)}             unit=""            color="var(--p-vpd)"  />}
        {device.sensor_capabilities?.ec            && <MetricCell icon="/icono-dewpoint.png" label="EC"         value={fmt2(device.ec)}             unit=" mS/cm"      color="var(--p-vpd)"  />}
        {device.sensor_capabilities?.soil_temperature && <MetricCell icon="/icono-temp.png" label="T° sustrato" value={fmt1(device.soil_temperature)} unit="°C"         color="var(--p-temp)" />}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--p-border-light)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: 'var(--p-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          🔋 {fmt2(device.battery_voltage)}{device.battery_voltage != null ? ' V' : ''}
        </span>
        <span style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>
          {formatLastSeen(device.last_seen_at)}
        </span>
      </div>
    </div>
  )
}

export default function DevicesModule() {
  const { siteId } = useSiteContext()
  const navigate = useNavigate()

  const { data: devices, isLoading, isError } = useQuery({
    queryKey: ['devices', siteId],
    queryFn: () => getSiteDevices(siteId!),
    enabled: !!siteId,
    refetchInterval: 30_000,
  })

  if (!siteId) {
    return (
      <div style={{ padding: 32, color: 'var(--p-text-secondary)' }}>
        Sin site seleccionado. <a href="/select-site" style={{ color: 'var(--p-primary)' }}>Seleccionar site</a>
      </div>
    )
  }

  return (
    <div>
      {isError && (
        <div style={{ margin: '16px 20px 0', padding: '10px 14px', background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 14 }}>
          Error al cargar los dispositivos. Intente nuevamente.
        </div>
      )}

      <div className="devices-grid">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

        {!isLoading && devices?.map((device: Device) => (
          <DeviceCard
            key={device.device_id}
            device={device}
            onClick={() => navigate(`/dashboard/telemetry/${device.device_id}`)}
          />
        ))}

        {!isLoading && !isError && devices?.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: '48px 16px', textAlign: 'center', color: 'var(--p-text-muted)' }}>
            No hay dispositivos en este site.
          </div>
        )}
      </div>
    </div>
  )
}
