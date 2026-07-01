import { api } from './api'

export interface Device {
  id: string
  device_id: string
  display_name: string
  device_type: string
  zone_id: string
  zone_name: string | null
  enabled: boolean
  firmware_version: string | null
  last_seen_at: string
  online: boolean
  last_telemetry_ts: string | null
  // Base sensors — present in all node types
  temperature: number | null
  humidity: number | null
  vpd: number | null
  battery_voltage: number | null
  light: number | null
  co2: number | null
  // Optional sensors — only present in specific node types.
  // Use sensor_capabilities to check availability before displaying.
  ppfd: number | null
  ph: number | null
  ec: number | null
  soil_temperature: number | null
  ec_temperature: number | null
  // Capacitive soil moisture sensor (FSN-703-olmo)
  soil_moisture_cap: number | null
  soil_temp_cap: number | null
  // RIKA NPK 7-in-1 sensor (olmov-FSN-702)
  rika_moisture: number | null
  rika_temperature: number | null
  rika_ec: number | null
  rika_ph: number | null
  // Declares which sensor columns this device has ever reported.
  // Set by the backend on first telemetry receipt. Used to show/hide widgets.
  sensor_capabilities: Record<string, boolean>
}

export interface TelemetryPoint {
  timestamp: string
  temperature: number | null
  humidity: number | null
  vpd: number | null
  battery_voltage: number | null
  dew_point: number | null
  light: number | null
  co2: number | null
  flow_main: number | null
  ppfd: number | null
  ph: number | null
  ec: number | null
  soil_temperature: number | null
  soil_moisture_cap: number | null
  soil_temp_cap: number | null
  rika_moisture: number | null
  rika_temperature: number | null
  rika_ec: number | null
  rika_ph: number | null
}

export interface TelemetryParams {
  from: string
  to: string
  aggregation?: 'raw' | 'hourly' | 'daily'
  variables?: string
}

export async function getSiteDevices(siteId: string, zoneId?: string): Promise<Device[]> {
  const params: Record<string, string> = {}
  if (zoneId) params.zone_id = zoneId
  const { data } = await api.get<{ devices: Device[] }>(`/dashboard/sites/${siteId}/devices`, { params })
  return data.devices
}

export interface Gateway {
  id: string
  device_id: string
  display_name: string
  enabled: boolean
  last_seen_at: string | null
  online: boolean
  wifi_rssi: number | null
  uptime_seconds: number | null
}

export async function getSiteGateways(siteId: string): Promise<Gateway[]> {
  const { data } = await api.get<{ gateways: Gateway[] }>(`/dashboard/sites/${siteId}/gateways`)
  return data.gateways
}

export async function patchDeviceName(deviceId: string, displayName: string): Promise<void> {
  await api.patch(`/dashboard/devices/${deviceId}`, { display_name: displayName })
}

export async function getDeviceTelemetry(
  deviceId: string,
  params: TelemetryParams,
): Promise<TelemetryPoint[]> {
  const { data } = await api.get<{ device_id: string; aggregation: string; rows: TelemetryPoint[] }>(
    `/dashboard/devices/${deviceId}/telemetry`,
    { params },
  )
  return data.rows
}
