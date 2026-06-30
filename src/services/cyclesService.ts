import { api } from './api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CropType {
  crop_type: string
  base_temp: number | null
  notes:     string | null
}

export interface Cycle {
  id:                        string
  lot_id:                    string
  name:                      string
  crop_type:                 string
  base_temp:                 number | null
  started_at:                string        // YYYY-MM-DD
  ended_at:                  string | null // null = active
  monitoring_frequency_days: number
  notes:                     string | null
  created_by:                string | null
  created_at:                string
  last_monitored_at:         string | null // YYYY-MM-DD
  days_without_monitoring:   number | null
  degree_days:               number | null // null if no nodes assigned to the lot
}

export interface MonitoringItem {
  id:              string
  item_key:        string
  label:           string
  category:        'pest' | 'disease' | 'metric'
  scale_type:      'count' | 'scale_0_5' | 'percent' | 'boolean'
  threshold_value: number | null
  threshold_notes: string | null
  sort_order:      number
}

export interface MonitoringFocus {
  id:            string
  monitoring_id: string
  item_key:      string
  location_text: string | null
  notes:         string | null
  created_at:    string
}

export interface Monitoring {
  id:                   string
  cycle_id:             string
  monitored_at:         string   // YYYY-MM-DD
  plant_label:          string | null
  week_number:          number
  days_from_transplant: number
  scores:               Record<string, number | boolean>
  sampling_effort:      Record<string, unknown> | null
  notes:                string | null
  created_by:           string | null
  created_at:           string
  foci:                 MonitoringFocus[]
}

export interface CreateCyclePayload {
  name:                       string
  crop_type:                  string
  started_at:                 string  // YYYY-MM-DD
  notes?:                     string
  monitoring_frequency_days?: number
}

export type EventType = 'sowing' | 'transplant' | 'application' | 'harvest'

export interface CycleEvent {
  id:                   string
  event_type:           EventType
  occurred_at:          string
  notes:                string | null
  data:                 Record<string, unknown> | null
  days_from_transplant: number | null
  created_by:           string | null
  created_at:           string
}

export interface ApplicationProduct {
  commercial_name:   string
  active_ingredient?: string
  dose?:             number
  dose_unit?:        string
}

export interface PesticideProduct {
  id:                    string
  commercial_name:       string
  active_ingredient:     string
  dose_unit:             string | null
  default_dose:          number | null
  toxicological_category: string | null
}

export interface CreateEventPayload {
  event_type:  EventType
  occurred_at: string   // ISO datetime
  notes?:      string
  data?: {
    products?: ApplicationProduct[]
  }
}

export interface CreateMonitoringPayload {
  monitored_at: string  // YYYY-MM-DD
  plant_label?: string
  scores:       Record<string, number | boolean>
  notes?:       string
  foci?:        Array<{ item_key: string; location_text?: string; notes?: string }>
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getCropTypes(): Promise<CropType[]> {
  const { data } = await api.get<{ crop_types: CropType[] }>('/dashboard/crop-types')
  return data.crop_types
}

export async function getLotCycles(lotId: string): Promise<Cycle[]> {
  const { data } = await api.get<{ cycles: Cycle[] }>(`/dashboard/lots/${lotId}/cycles`)
  return data.cycles
}

export async function getCycle(cycleId: string): Promise<Cycle> {
  const { data } = await api.get<{ cycle: Cycle }>(`/dashboard/cycles/${cycleId}`)
  return data.cycle
}

export async function createCycle(lotId: string, payload: CreateCyclePayload): Promise<string> {
  const { data } = await api.post<{ id: string }>(`/dashboard/lots/${lotId}/cycles`, payload)
  return data.id
}

export async function closeCycle(cycleId: string, endedAt: string): Promise<void> {
  await api.patch(`/dashboard/cycles/${cycleId}/close`, { ended_at: endedAt })
}

export async function getMonitoringItems(cycleId: string): Promise<{ crop_type: string; items: MonitoringItem[] }> {
  const { data } = await api.get<{ crop_type: string; items: MonitoringItem[] }>(`/dashboard/cycles/${cycleId}/monitoring-items`)
  return data
}

export async function getCycleMonitorings(cycleId: string): Promise<Monitoring[]> {
  const { data } = await api.get<{ monitorings: Monitoring[] }>(`/dashboard/cycles/${cycleId}/monitorings`)
  return data.monitorings
}

export async function getCycleEvents(cycleId: string): Promise<CycleEvent[]> {
  const { data } = await api.get<{ events: CycleEvent[] }>(`/dashboard/cycles/${cycleId}/events`)
  return data.events
}

export async function createCycleEvent(cycleId: string, payload: CreateEventPayload): Promise<string> {
  const { data } = await api.post<{ id: string }>(`/dashboard/cycles/${cycleId}/events`, payload)
  return data.id
}

export async function getPesticideProducts(): Promise<PesticideProduct[]> {
  const { data } = await api.get<{ products: PesticideProduct[] }>('/dashboard/pesticide-products')
  return data.products
}

export async function createMonitoring(
  cycleId: string,
  payload: CreateMonitoringPayload,
): Promise<{ id: string; lot_status: string }> {
  const { data } = await api.post<{ id: string; lot_status: string }>(
    `/dashboard/cycles/${cycleId}/monitorings`,
    payload,
  )
  return data
}
