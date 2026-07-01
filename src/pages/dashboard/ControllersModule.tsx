import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import {
  getControllers,
  getFoggers,
  updateControllerOverride,
  type Controller,
  type Fogger,
} from '../../services/irrigationService'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SYNC_COLORS: Record<Controller['sync_status'], { bg: string; text: string }> = {
  synced:  { bg: '#d1fae5', text: '#065f46' },
  pending: { bg: '#fef3c7', text: '#92400e' },
  error:   { bg: '#fee2e2', text: '#991b1b' },
}

function SyncBadge({ status }: { status: Controller['sync_status'] }) {
  const { bg, text } = SYNC_COLORS[status]
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color: text }}>
      {status}
    </span>
  )
}

function FoggerStatusBadge({ online }: { online: boolean }) {
  const bg   = online ? '#d1fae5' : '#f3f4f6'
  const text = online ? '#065f46' : '#6b7280'
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color: text }}>
      {online ? 'online' : 'offline'}
    </span>
  )
}

function formatHeartbeat(ts: string | null): string {
  if (!ts) return '—'
  const diffMs = Date.now() - new Date(ts).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `${diffMin}m atrás`
  return `${Math.floor(diffMin / 60)}h atrás`
}

const OVERRIDE_OPTIONS: { value: Controller['override_mode']; label: string }[] = [
  { value: 'none',           label: 'Ninguno'        },
  { value: 'temporary_24h', label: 'Temporal 24h'    },
  { value: 'temporary_48h', label: 'Temporal 48h'    },
  { value: 'permanent',     label: 'Permanente'      },
]

// ── Gateway row ───────────────────────────────────────────────────────────────

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '—'
  const h = Math.floor(seconds / 3600)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 60)}m`
}

function rssiColor(rssi: number | null): string {
  if (rssi == null) return '#9ca3af'
  if (rssi >= -70) return '#16a34a'
  if (rssi >= -85) return '#ca8a04'
  return '#dc2626'
}

function GatewayRow({ controller }: { controller: Controller }) {
  const rssi    = controller.context?.last_wifi_rssi as number | null ?? null
  const uptime  = controller.context?.last_uptime_seconds as number | null ?? null
  const online  = controller.last_seen_at
    ? (Date.now() - new Date(controller.last_seen_at).getTime()) < 5 * 60 * 1000
    : false

  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ padding: '12px 16px', fontWeight: 500, color: '#111827' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#16a34a' : '#dc2626', flexShrink: 0 }} />
          {controller.device_name}
        </span>
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: rssiColor(rssi) }}>
        {rssi != null ? `${rssi} dBm` : '—'}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>
        {formatUptime(uptime)}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>
        {formatHeartbeat(controller.last_seen_at)}
      </td>
    </tr>
  )
}

// ── Controller row ────────────────────────────────────────────────────────────

function ControllerRow({ controller }: { controller: Controller }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (mode: Controller['override_mode']) =>
      updateControllerOverride(controller.id, mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['controllers'] }),
  })

  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ padding: '12px 16px', fontWeight: 500, color: '#111827' }}>{controller.device_name}</td>
      <td style={{ padding: '12px 16px' }}>
        <SyncBadge status={controller.sync_status} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <select
          value={controller.override_mode}
          disabled={mutation.isPending}
          onChange={e => mutation.mutate(e.target.value as Controller['override_mode'])}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, cursor: 'pointer' }}
        >
          {OVERRIDE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {mutation.isError && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#991b1b' }}>Error</span>
        )}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>
        {formatHeartbeat(controller.last_seen_at)}
      </td>
    </tr>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function ControllersModule() {
  const {
    data: allControllers,
    isLoading: loadingControllers,
    isError: errorControllers,
  } = useQuery({ queryKey: ['controllers'], queryFn: getControllers })

  const controllers = allControllers?.filter(c => c.device_type !== 'gateway') ?? []
  const gateways    = allControllers?.filter(c => c.device_type === 'gateway')  ?? []

  const {
    data: foggers,
    isLoading: loadingFoggers,
    isError: errorFoggers,
  } = useQuery({ queryKey: ['foggers'], queryFn: getFoggers })

  const sectionTitle = (title: string) => (
    <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#374151' }}>{title}</h3>
  )

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#111827' }}>Controladores y Foggers</h2>

      {/* Gateways section — only shown when there are gateways in the site */}
      {gateways.length > 0 && (
        <div>
          {sectionTitle('Gateways LoRa')}
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Gateway', 'WiFi RSSI', 'Uptime', 'Último heartbeat'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gateways.map(c => <GatewayRow key={c.id} controller={c} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Controllers section */}
      <div>
        {sectionTitle('Controladores')}
        {errorControllers && (
          <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
            Error al cargar controladores.
          </div>
        )}
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Nombre', 'Sync', 'Override mode', 'Último heartbeat'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingControllers && Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} style={{ padding: '12px 16px' }}>
                      <div style={{ height: 14, borderRadius: 4, background: '#e5e7eb', width: j === 0 ? 120 : 80 }} />
                    </td>
                  ))}
                </tr>
              ))}
              {controllers?.map(c => <ControllerRow key={c.id} controller={c} />)}
              {!loadingControllers && controllers?.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af' }}>
                    No hay controladores registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Foggers section */}
      <div>
        {sectionTitle('Foggers')}
        {errorFoggers && (
          <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
            Error al cargar foggers.
          </div>
        )}
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Nombre', 'Estado', 'Behavior config'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingFoggers && Array.from({ length: 2 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 3 }).map((_, j) => (
                    <td key={j} style={{ padding: '12px 16px' }}>
                      <div style={{ height: 14, borderRadius: 4, background: '#e5e7eb', width: j === 2 ? 200 : 100 }} />
                    </td>
                  ))}
                </tr>
              ))}
              {foggers?.map((f: Fogger) => (
                <tr key={f.actuator_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: '#111827' }}>{f.actuator_label || f.device_name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <FoggerStatusBadge online={f.online} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <code style={{ fontSize: 12, background: '#f9fafb', padding: '2px 6px', borderRadius: 4, color: '#374151', display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(f.behavior_config)}
                    </code>
                  </td>
                </tr>
              ))}
              {!loadingFoggers && foggers?.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af' }}>
                    No hay foggers registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
