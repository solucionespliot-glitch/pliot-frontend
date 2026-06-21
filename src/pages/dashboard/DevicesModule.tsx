import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSiteContext } from '../../hooks/useSiteContext'
import { getSiteDevices, patchDeviceName, type Device } from '../../services/devicesService'

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

function DeviceCard({ device, onClick, onRename }: {
  device: Device
  onClick: () => void
  onRename: (deviceId: string, name: string) => Promise<void>
}) {
  const status = getStatus(device)
  const { bg, text } = STATUS_COLORS[status]

  // Inline editing state for display_name
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // display_name is considered custom when it differs from device_id
  const hasCustomName = device.display_name !== device.device_id

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditValue(hasCustomName ? device.display_name : '')
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function commitEdit() {
    const trimmed = editValue.trim()
    // If blank, use device_id (effectively clears the custom name)
    const finalName = trimmed || device.device_id
    if (finalName === device.display_name) { setIsEditing(false); return }
    setSaving(true)
    await onRename(device.device_id, finalName)
    setSaving(false)
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { setIsEditing(false) }
  }

  return (
    <div className={`device-card device-card--${status}`} onClick={onClick}>
      {/* Header */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--p-border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          {/* Left: technical device_id */}
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--p-text)', lineHeight: 1.2 }}>
            {device.device_id}
          </span>
          {/* Right: editable display_name + status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitEdit}
                placeholder={device.device_id}
                disabled={saving}
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: 12, padding: '2px 6px', borderRadius: 6,
                  border: '1px solid var(--p-primary)', outline: 'none',
                  width: 130, color: 'var(--p-text)', background: 'var(--p-bg)',
                }}
              />
            ) : (
              <button
                onClick={startEdit}
                title="Editar nombre"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 12, padding: '2px 6px', borderRadius: 6,
                  border: '1px solid transparent', background: 'transparent',
                  color: hasCustomName ? 'var(--p-text-secondary)' : 'var(--p-text-muted)',
                  cursor: 'pointer',
                }}
              >
                {hasCustomName ? device.display_name : 'Agregar nombre'}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--p-radius-badge)', background: bg, color: text, whiteSpace: 'nowrap' }}>
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>
        {/* Gray line: only zone (device_id already shown bold above) */}
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--p-text-muted)' }}>
          {device.zone_name ?? ''}
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
        {device.sensor_capabilities?.soil_temperature && <MetricCell icon="/icono-temp.png" label="T° sustrato"   value={fmt1(device.soil_temperature)}   unit="°C"      color="var(--p-temp)" />}
        {device.sensor_capabilities?.soil_moisture_cap && <MetricCell icon="/icono-hum.png"  label="Hum. suelo"    value={fmt1(device.soil_moisture_cap)}  unit="%"       color="#92400e" />}
        {device.sensor_capabilities?.soil_temp_cap     && <MetricCell icon="/icono-temp.png" label="T° suelo"      value={fmt1(device.soil_temp_cap)}      unit="°C"      color="#a16207" />}
        {device.sensor_capabilities?.rika_moisture     && <MetricCell icon="/icono-hum.png"  label="Hum. suelo R"  value={fmt1(device.rika_moisture)}      unit="%"       color="#92400e" />}
        {device.sensor_capabilities?.rika_temperature  && <MetricCell icon="/icono-temp.png" label="T° suelo R"    value={fmt1(device.rika_temperature)}   unit="°C"      color="#a16207" />}
        {device.sensor_capabilities?.rika_ec           && <MetricCell icon="/icono-dewpoint.png" label="EC suelo"  value={fmt2(device.rika_ec)}            unit=" mS/cm"  color="var(--p-vpd)" />}
        {device.sensor_capabilities?.rika_ph           && <MetricCell icon="/icono-dewpoint.png" label="pH suelo"  value={fmt2(device.rika_ph)}            unit=""        color="var(--p-vpd)" />}
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
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: devices, isLoading, isError } = useQuery({
    queryKey: ['devices', siteId],
    queryFn: () => getSiteDevices(siteId!),
    enabled: !!siteId,
    refetchInterval: 30_000,
  })

  // Rename a device and refresh the list
  async function handleRename(deviceId: string, name: string) {
    await patchDeviceName(deviceId, name)
    await queryClient.invalidateQueries({ queryKey: ['devices', siteId] })
  }

  // Filter by device_id or display_name, case-insensitive
  const filteredDevices = devices?.filter(d => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      d.device_id.toLowerCase().includes(q) ||
      (d.display_name ?? '').toLowerCase().includes(q) ||
      (d.zone_name ?? '').toLowerCase().includes(q)
    )
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

      {/* Search bar */}
      <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="search"
          placeholder="Buscar nodo por nombre, ID o zona..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, maxWidth: 400,
            padding: '7px 12px', borderRadius: 8, border: '1px solid var(--p-border)',
            fontSize: 14, color: 'var(--p-text)', background: 'var(--p-bg)',
            outline: 'none',
          }}
        />
        {search && (
          <span style={{ fontSize: 13, color: 'var(--p-text-muted)' }}>
            {filteredDevices?.length ?? 0} resultado{filteredDevices?.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="devices-grid">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

        {!isLoading && filteredDevices?.map((device: Device) => (
          <DeviceCard
            key={device.device_id}
            device={device}
            onClick={() => navigate(`/dashboard/telemetry/${device.device_id}`, { state: { display_name: device.display_name } })}
            onRename={handleRename}
          />
        ))}

        {!isLoading && !isError && filteredDevices?.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: '48px 16px', textAlign: 'center', color: 'var(--p-text-muted)' }}>
            {search ? `Sin resultados para "${search}".` : 'No hay dispositivos en este site.'}
          </div>
        )}
      </div>
    </div>
  )
}
