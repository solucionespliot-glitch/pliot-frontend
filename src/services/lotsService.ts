import { api } from './api'

// ── Types ─────────────────────────────────────────────────────────────────────

export type LotStatus = 'green' | 'yellow' | 'red'

export type EventType = 'sowing' | 'transplant' | 'application' | 'harvest'

export interface LotNode {
  device_uuid:  string
  device_id:    string
  display_name: string
  last_seen_at?: string
}

export interface LotEvent {
  id:                string
  event_type:        EventType
  occurred_at:       string
  notes:             string | null
  data:              Record<string, unknown> | null
  created_at:        string
  // Set when the event was created from a cycle
  cycle_id:          string | null
  cycle_name:        string | null
  cycle_crop_type:   string | null
  cycle_started_at:  string | null
  cycle_ended_at:    string | null
}

export interface Lot {
  id:          string
  name:        string
  area_ha:     number | null
  status:      LotStatus
  notes:       string | null
  created_at:  string
  updated_at:  string
  nodes:       LotNode[]
  last_event:  Pick<LotEvent, 'id' | 'event_type' | 'occurred_at' | 'notes'> | null
}

export interface MonitoringSummary {
  monitored_at:     string  // YYYY-MM-DD
  cycle_id:         string
  cycle_name:       string
  cycle_crop_type:  string
  count:            number  // plants monitored on this date
}

export interface LotDetail extends Lot {
  events:               LotEvent[]
  monitoring_summaries: MonitoringSummary[]
}

export interface CreateLotPayload {
  name:      string
  area_ha?:  number
  status?:   LotStatus
  notes?:    string
  node_ids?: string[]   // devices.id UUIDs
}

export interface PatchLotPayload {
  name?:      string
  area_ha?:   number | null
  status?:    LotStatus
  notes?:     string | null
  node_ids?:  string[]
}

export interface CreateEventPayload {
  event_type:  EventType
  occurred_at: string   // ISO datetime
  notes?:      string
  data?:       Record<string, unknown>
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getSiteLots(siteId: string): Promise<Lot[]> {
  const { data } = await api.get<{ lots: Lot[] }>(`/dashboard/sites/${siteId}/lots`)
  return data.lots
}

export async function createLot(siteId: string, payload: CreateLotPayload): Promise<string> {
  const { data } = await api.post<{ id: string }>(`/dashboard/sites/${siteId}/lots`, payload)
  return data.id
}

export async function getLotDetail(lotId: string): Promise<LotDetail> {
  const { data } = await api.get<{ lot: LotDetail }>(`/dashboard/lots/${lotId}`)
  return data.lot
}

export async function patchLot(lotId: string, payload: PatchLotPayload): Promise<void> {
  await api.patch(`/dashboard/lots/${lotId}`, payload)
}

export async function deleteLot(lotId: string): Promise<void> {
  await api.delete(`/dashboard/lots/${lotId}`)
}

export async function createLotEvent(lotId: string, payload: CreateEventPayload): Promise<string> {
  const { data } = await api.post<{ id: string }>(`/dashboard/lots/${lotId}/events`, payload)
  return data.id
}
