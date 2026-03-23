import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { useSiteContext } from '../../hooks/useSiteContext'
import { getSiteDevices, type Device } from '../../services/devicesService'

function isOnline(device: Device): boolean {
  return device.online || (
    !!device.last_seen_at &&
    Date.now() - new Date(device.last_seen_at).getTime() < 5 * 60 * 1000
  )
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return '—'
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

function StatusBadge({ online }: { online: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: online ? '#d1fae5' : '#fee2e2',
      color: online ? '#065f46' : '#991b1b',
    }}>
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{
            height: 14,
            borderRadius: 4,
            background: '#e5e7eb',
            width: i === 0 ? 120 : 60,
          }} />
        </td>
      ))}
    </tr>
  )
}

const COLUMNS = ['Device ID', 'Type', 'Zone', 'Last seen', 'Temp (°C)', 'Humidity (%)', 'Battery (V)', 'Status']

export default function DevicesModule() {
  const { siteId } = useSiteContext()
  const navigate = useNavigate()

  const { data: devices, isLoading, isError } = useQuery({
    queryKey: ['devices', siteId],
    queryFn: () => getSiteDevices(siteId!),
    enabled: !!siteId,
    refetchInterval: 30_000, // refresh every 30s
  })

  if (!siteId) {
    return (
      <div style={{ padding: 32, color: '#6b7280' }}>
        No site selected. <Link to="/select-site" style={{ color: '#4f46e5' }}>Select a site</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0, marginBottom: 20, color: '#111827', fontSize: 20, fontWeight: 600 }}>
        Devices
      </h2>

      {isError && (
        <div style={{
          padding: '12px 16px',
          background: '#fee2e2',
          color: '#991b1b',
          borderRadius: 8,
          marginBottom: 16,
        }}>
          Failed to load devices. Please try again.
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {COLUMNS.map((col) => (
                <th key={col} style={{
                  padding: '10px 16px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#6b7280',
                  whiteSpace: 'nowrap',
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && devices?.map((device: Device) => (
              <tr
                key={device.device_id}
                onClick={() => navigate(`/dashboard/telemetry/${device.device_id}`)}
                style={{
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#111827' }}>
                  {device.display_name || device.device_id}
                </td>
                <td style={{ padding: '12px 16px', color: '#374151' }}>{device.device_type}</td>
                <td style={{ padding: '12px 16px', color: '#374151' }}>{device.zone_name ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#6b7280' }}>
                  {formatLastSeen(device.last_seen_at)}
                </td>
                <td style={{ padding: '12px 16px', color: '#374151' }}>
                  {device.temperature != null ? device.temperature.toFixed(1) : '—'}
                </td>
                <td style={{ padding: '12px 16px', color: '#374151' }}>
                  {device.humidity != null ? device.humidity.toFixed(1) : '—'}
                </td>
                <td style={{ padding: '12px 16px', color: '#374151' }}>
                  {device.battery_voltage != null ? device.battery_voltage.toFixed(2) : '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <StatusBadge online={isOnline(device)} />
                </td>
              </tr>
            ))}

            {!isLoading && !isError && devices?.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: '#9ca3af' }}>
                  No devices found for this site.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
