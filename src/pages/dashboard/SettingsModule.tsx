import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import {
  getNotificationContacts,
  createContact,
  updateContact,
  deleteContact,
  getSettingsDevices,
  getDeviceQuota,
  addDevice,
  getSecurityAlerts,
  getOrganizations,
  impersonate,
  ALL_ALERT_TYPES,
  ALERT_TYPE_LABELS,
  type NotificationContact,
  type ContactPayload,
  type AlertType,
  type AddDevicePayload,
} from '../../services/settingsService'

const ROLES_CLAIM = `${import.meta.env.VITE_AUTH0_AUDIENCE}/roles`

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? '#4f46e5' : '#d1d5db',
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: checked ? 18 : 2, width: 16, height: 16,
        borderRadius: 8, background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

function Btn({
  children, onClick, variant = 'secondary', disabled, type = 'button', small,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  small?: boolean
}) {
  const bg = variant === 'primary' ? '#4f46e5' : variant === 'danger' ? '#ef4444' : '#fff'
  const color = variant === 'secondary' ? '#374151' : '#fff'
  const border = variant === 'secondary' ? '1px solid #d1d5db' : 'none'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '4px 10px' : '8px 16px',
        borderRadius: 6, border, background: disabled ? '#e5e7eb' : bg,
        color: disabled ? '#9ca3af' : color,
        fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: small ? 12 : 14, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
      {msg}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 14, width: '100%', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = { ...inputStyle }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 12, padding: 28, width: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function TH({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>{children}</th>
}

function TD({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '11px 14px', color: '#374151', fontSize: 14, verticalAlign: 'middle' }}>{children}</td>
}

// ── Tab 1: Notificaciones ─────────────────────────────────────────────────────

const EMPTY_CONTACT: ContactPayload = {
  name: '', channel: 'email', destination: '', alert_types: [],
}

function ContactModal({
  initial,
  onClose,
}: {
  initial?: NotificationContact
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ContactPayload>(
    initial
      ? { name: initial.name, channel: initial.channel, destination: initial.destination, alert_types: initial.alert_types }
      : EMPTY_CONTACT
  )

  const mutation = useMutation({
    mutationFn: initial
      ? (p: ContactPayload) => updateContact(initial.id, p)
      : createContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-contacts'] })
      onClose()
    },
  })

  function toggleAlertType(type: AlertType) {
    setForm(f => ({
      ...f,
      alert_types: f.alert_types.includes(type)
        ? f.alert_types.filter(t => t !== type)
        : [...f.alert_types, type],
    }))
  }

  return (
    <Modal title={initial ? 'Editar contacto' : 'Agregar contacto'} onClose={onClose}>
      <form
        onSubmit={e => { e.preventDefault(); mutation.mutate(form) }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <Field label="Nombre">
          <input style={inputStyle} value={form.name} required
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Canal">
          <select style={selectStyle} value={form.channel}
            onChange={e => setForm(f => ({ ...f, channel: e.target.value as 'email' | 'whatsapp' }))}>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </Field>
        <Field label={form.channel === 'email' ? 'Dirección de email' : 'Número de WhatsApp'}>
          <input style={inputStyle} value={form.destination} required
            type={form.channel === 'email' ? 'email' : 'tel'}
            placeholder={form.channel === 'email' ? 'usuario@dominio.com' : '+54 9 11 0000 0000'}
            onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
        </Field>
        <Field label="Tipos de alerta">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            {ALL_ALERT_TYPES.map(type => (
              <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.alert_types.includes(type)}
                  onChange={() => toggleAlertType(type)}
                />
                {ALERT_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
        </Field>
        {mutation.isError && <ErrorBanner msg="Error al guardar el contacto." />}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando...' : initial ? 'Guardar' : 'Agregar'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

function NotificationsTab() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<NotificationContact | null | 'new'>(null)

  const { data: contacts = [], isLoading, isError } = useQuery({
    queryKey: ['notification-contacts'],
    queryFn: getNotificationContacts,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateContact(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-contacts'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteContact,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-contacts'] }),
  })

  function handleDelete(id: string, name: string) {
    if (window.confirm(`¿Eliminar el contacto "${name}"?`)) deleteMutation.mutate(id)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn variant="primary" onClick={() => setEditing('new')}>+ Agregar contacto</Btn>
      </div>

      {isError && <ErrorBanner msg="Error al cargar los contactos." />}

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <TH>Nombre</TH>
              <TH>Canal</TH>
              <TH>Destino</TH>
              <TH>Alertas</TH>
              <TH>Activo</TH>
              <TH>Acciones</TH>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} style={{ padding: '11px 14px' }}>
                    <div style={{ height: 13, borderRadius: 4, background: '#e5e7eb', width: j === 2 ? 140 : 80 }} />
                  </td>
                ))}
              </tr>
            ))}
            {contacts.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <TD>{c.name}</TD>
                <TD>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: c.channel === 'email' ? '#dbeafe' : '#dcfce7',
                    color: c.channel === 'email' ? '#1e40af' : '#166534',
                  }}>
                    {c.channel === 'email' ? 'Email' : 'WhatsApp'}
                  </span>
                </TD>
                <TD><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.destination}</span></TD>
                <TD>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {c.alert_types.map(t => (
                      <span key={t} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 8, background: '#f3f4f6', color: '#6b7280' }}>
                        {ALERT_TYPE_LABELS[t]}
                      </span>
                    ))}
                    {c.alert_types.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
                  </div>
                </TD>
                <TD>
                  <Toggle
                    checked={c.enabled}
                    onChange={() => toggleMutation.mutate({ id: c.id, enabled: !c.enabled })}
                  />
                </TD>
                <TD>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn small onClick={() => setEditing(c)}>Editar</Btn>
                    <Btn small variant="danger" onClick={() => handleDelete(c.id, c.name)}>Eliminar</Btn>
                  </div>
                </TD>
              </tr>
            ))}
            {!isLoading && contacts.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '28px 14px', textAlign: 'center', color: '#9ca3af' }}>
                  No hay contactos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing === 'new' && <ContactModal onClose={() => setEditing(null)} />}
      {editing && editing !== 'new' && (
        <ContactModal initial={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

// ── Tab 2: Dispositivos ───────────────────────────────────────────────────────

const TRANSPORT_TYPES = ['LoRa', 'WiFi', 'Ethernet', 'LTE']

function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AddDevicePayload>({
    device_id: '', device_type: '', site: '', zone: '', transport_type: 'LoRa',
  })

  const mutation = useMutation({
    mutationFn: addDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-devices'] })
      onClose()
    },
  })

  return (
    <Modal title="Agregar dispositivo" onClose={onClose}>
      <form
        onSubmit={e => { e.preventDefault(); mutation.mutate(form) }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <Field label="Device ID">
          <input style={inputStyle} value={form.device_id} required
            placeholder="DEV-XXXX" onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))} />
        </Field>
        <Field label="Tipo de dispositivo">
          <input style={inputStyle} value={form.device_type} required
            placeholder="sensor_node, controller, fogger..." onChange={e => setForm(f => ({ ...f, device_type: e.target.value }))} />
        </Field>
        <Field label="Sitio">
          <input style={inputStyle} value={form.site} required
            onChange={e => setForm(f => ({ ...f, site: e.target.value }))} />
        </Field>
        <Field label="Zona">
          <input style={inputStyle} value={form.zone} required
            onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} />
        </Field>
        <Field label="Tipo de transporte">
          <select style={selectStyle} value={form.transport_type}
            onChange={e => setForm(f => ({ ...f, transport_type: e.target.value }))}>
            {TRANSPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        {mutation.isError && <ErrorBanner msg="Error al agregar el dispositivo. Verificá el plan o los datos ingresados." />}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Agregando...' : 'Agregar'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

function DevicesTab() {
  const [showAdd, setShowAdd] = useState(false)

  const { data: devices = [], isLoading, isError } = useQuery({
    queryKey: ['settings-devices'],
    queryFn: getSettingsDevices,
  })

  const { data: quota } = useQuery({
    queryKey: ['device-quota'],
    queryFn: getDeviceQuota,
  })

  const atLimit = quota ? quota.current >= quota.limit : false

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        {quota && (
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            Dispositivos: <strong style={{ color: atLimit ? '#ef4444' : '#111827' }}>{quota.current}</strong> / {quota.limit}
          </span>
        )}
        <Btn
          variant="primary"
          disabled={atLimit}
          onClick={() => setShowAdd(true)}
        >
          + Agregar dispositivo
        </Btn>
      </div>
      {atLimit && (
        <div style={{ padding: '10px 14px', background: '#fef3c7', color: '#92400e', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          Has alcanzado el límite de dispositivos de tu plan actual.
        </div>
      )}

      {isError && <ErrorBanner msg="Error al cargar los dispositivos." />}

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <TH>Device ID</TH>
              <TH>Tipo</TH>
              <TH>Sitio</TH>
              <TH>Zona</TH>
              <TH>Firmware</TH>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} style={{ padding: '11px 14px' }}>
                    <div style={{ height: 13, borderRadius: 4, background: '#e5e7eb', width: j === 0 ? 130 : 80 }} />
                  </td>
                ))}
              </tr>
            ))}
            {devices.map(d => (
              <tr key={d.device_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <TD><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{d.device_id}</span></TD>
                <TD>{d.type}</TD>
                <TD>{d.site}</TD>
                <TD>{d.zone}</TD>
                <TD><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{d.firmware_version}</span></TD>
              </tr>
            ))}
            {!isLoading && devices.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '28px 14px', textAlign: 'center', color: '#9ca3af' }}>
                  No hay dispositivos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && <AddDeviceModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

// ── Tab 3: Mi organización ────────────────────────────────────────────────────

function OrgTab() {
  const [selectedOrg, setSelectedOrg] = useState('')
  const [impersonated, setImpersonated] = useState(false)

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery({
    queryKey: ['security-alerts'],
    queryFn: getSecurityAlerts,
  })

  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: getOrganizations,
  })

  const impersonateMutation = useMutation({
    mutationFn: () => impersonate(selectedOrg),
    onSuccess: () => {
      setImpersonated(true)
    },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Security alerts */}
      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#374151' }}>
          Intentos de acceso desconocidos
        </h3>
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <TH>Device ID</TH>
                <TH>IP</TH>
                <TH>Fecha/hora</TH>
                <TH>Detalle</TH>
              </tr>
            </thead>
            <tbody>
              {loadingAlerts && Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} style={{ padding: '11px 14px' }}>
                      <div style={{ height: 13, borderRadius: 4, background: '#e5e7eb', width: j === 3 ? 200 : 100 }} />
                    </td>
                  ))}
                </tr>
              ))}
              {alerts.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <TD><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.device_id}</span></TD>
                  <TD><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.ip_address}</span></TD>
                  <TD><span style={{ fontSize: 13, color: '#6b7280' }}>{new Date(a.attempted_at).toLocaleString()}</span></TD>
                  <TD>{a.details}</TD>
                </tr>
              ))}
              {!loadingAlerts && alerts.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '28px 14px', textAlign: 'center', color: '#9ca3af' }}>
                    No hay intentos de acceso registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Impersonation */}
      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#374151' }}>
          Impersonar organización
        </h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={selectedOrg}
            onChange={e => { setSelectedOrg(e.target.value); setImpersonated(false) }}
            style={{ ...selectStyle, width: 260 }}
          >
            <option value="">Seleccionar organización...</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <Btn
            variant="primary"
            disabled={!selectedOrg || impersonateMutation.isPending}
            onClick={() => impersonateMutation.mutate()}
          >
            {impersonateMutation.isPending ? 'Impersonando...' : 'Impersonar'}
          </Btn>
        </div>
        {impersonated && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#065f46', background: '#d1fae5', padding: '8px 12px', borderRadius: 6, display: 'inline-block' }}>
            Token de impersonación aplicado. Recargá la página para usar la sesión.
          </p>
        )}
        {impersonateMutation.isError && <ErrorBanner msg="Error al impersonar la organización." />}
      </div>
    </div>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

type Tab = 'notifications' | 'devices' | 'org'

const TABS: { id: Tab; label: string }[] = [
  { id: 'notifications', label: 'Notificaciones' },
  { id: 'devices',       label: 'Dispositivos'   },
  { id: 'org',           label: 'Mi organización' },
]

export default function SettingsModule() {
  const { user } = useAuth0()
  const [activeTab, setActiveTab] = useState<Tab>('notifications')

  const userRoles: string[] = (user?.[ROLES_CLAIM] as string[]) ?? []
  const isSuperuser = userRoles.includes('superuser')

  const visibleTabs = isSuperuser ? TABS : TABS.filter(t => t.id !== 'org')

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 600, color: '#111827' }}>Configuración</h2>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 24, gap: 0 }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #4f46e5' : '2px solid transparent',
              marginBottom: -2,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? '#4f46e5' : '#6b7280',
              cursor: 'pointer',
              fontSize: 14,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'devices'       && <DevicesTab />}
      {activeTab === 'org'           && isSuperuser && <OrgTab />}
    </div>
  )
}
