import { api } from './api'

// ── Notifications ─────────────────────────────────────────────────────────────

export type AlertType =
  | 'irrigation_error'
  | 'sensor_offline'
  | 'fogger_fault'
  | 'device_unknown'
  | 'turn_finished'

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  irrigation_error: 'Error de riego',
  sensor_offline:   'Sensor offline',
  fogger_fault:     'Falla de fogger',
  device_unknown:   'Dispositivo desconocido',
  turn_finished:    'Turno finalizado',
}

export const ALL_ALERT_TYPES: AlertType[] = [
  'irrigation_error',
  'sensor_offline',
  'fogger_fault',
  'device_unknown',
  'turn_finished',
]

export interface NotificationContact {
  id: string
  name: string
  channel: 'email' | 'whatsapp'
  destination: string
  alert_types: AlertType[]
  enabled: boolean
}

export interface ContactPayload {
  name: string
  channel: 'email' | 'whatsapp'
  destination: string
  alert_types: AlertType[]
  enabled?: boolean
}

export async function getNotificationContacts(): Promise<NotificationContact[]> {
  const { data } = await api.get<{ contacts: NotificationContact[] }>('/dashboard/settings/notifications')
  return data.contacts
}

export async function createContact(payload: ContactPayload): Promise<NotificationContact> {
  const { data } = await api.post<NotificationContact>('/dashboard/settings/notifications', payload)
  return data
}

export async function updateContact(id: string, payload: Partial<ContactPayload>): Promise<NotificationContact> {
  const { data } = await api.patch<NotificationContact>(`/dashboard/settings/notifications/${id}`, payload)
  return data
}

export async function deleteContact(id: string): Promise<void> {
  await api.delete(`/dashboard/settings/notifications/${id}`)
}

// ── Devices ───────────────────────────────────────────────────────────────────

export interface SettingsDevice {
  device_id: string
  type: string
  zone: string
  firmware_version: string
  site: string
}

export interface DeviceQuota {
  current: number
  limit: number
}

export interface AddDevicePayload {
  device_id: string
  device_type: string
  site: string
  zone: string
  transport_type: string
}

export async function getSettingsDevices(): Promise<SettingsDevice[]> {
  const { data } = await api.get<SettingsDevice[]>('/dashboard/settings/devices')
  return data
}

export async function getDeviceQuota(): Promise<DeviceQuota> {
  const { data } = await api.get<DeviceQuota>('/dashboard/settings/devices/quota')
  return data
}

export async function addDevice(payload: AddDevicePayload): Promise<SettingsDevice> {
  const { data } = await api.post<SettingsDevice>('/dashboard/settings/devices', payload)
  return data
}

// ── Admin / Mi organización ───────────────────────────────────────────────────

export interface SecurityAlert {
  id: string
  device_id: string
  attempted_at: string
  ip_address: string
  details: string
}

export interface Organization {
  id: string
  name: string
}

export async function getSecurityAlerts(): Promise<SecurityAlert[]> {
  const { data } = await api.get<SecurityAlert[]>('/dashboard/admin/security-alerts')
  return data
}

export async function getOrganizations(): Promise<Organization[]> {
  const { data } = await api.get<Organization[]>('/dashboard/admin/organizations')
  return data
}

export async function impersonate(orgId: string): Promise<{ ok: boolean; organization_id: string; note: string }> {
  const { data } = await api.post<{ ok: boolean; organization_id: string; note: string }>(
    '/dashboard/admin/impersonate',
    { organization_id: orgId },
  )
  return data
}
