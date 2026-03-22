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
  temperature: number | null
  humidity: number | null
  vpd: number | null
  battery_voltage: number | null
  light: number | null
  co2: number | null
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
