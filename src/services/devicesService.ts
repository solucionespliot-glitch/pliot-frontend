import { api } from './api'

export interface Device {
  device_id: string
  type: string
  zone: string
  last_seen_at: string
  temperature: number | null
  humidity: number | null
  battery: number | null
}

export interface TelemetryPoint {
  timestamp: string
  temperature: number | null
  humidity: number | null
  vpd: number | null
  battery_voltage: number | null
}

export interface TelemetryParams {
  from: string
  to: string
  aggregation: 'raw' | 'hourly' | 'daily'
}

export async function getSiteDevices(siteId: string): Promise<Device[]> {
  const { data } = await api.get<Device[]>(`/dashboard/sites/${siteId}/devices`)
  return data
}

export async function getDeviceTelemetry(
  deviceId: string,
  params: TelemetryParams
): Promise<TelemetryPoint[]> {
  const { data } = await api.get<TelemetryPoint[]>(
    `/dashboard/devices/${deviceId}/telemetry`,
    { params }
  )
  return data
}
