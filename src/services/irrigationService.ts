import { api } from './api'

export interface IrrigationTurn {
  id: string
  name: string
  crop: string
  status: 'active' | 'paused' | 'error'
  etc_accumulated_mm: number
  etc_threshold_mm: number
  next_irrigation_at: string | null
  kc_stage: string
  days_since_sowing: number
  irrigations_today_count: number
  irrigations_today_mm: number
}

export interface TurnHistoryEntry {
  date: string
  planned_mm: number | null
  executed_mm: number | null
  observed_mm: number | null
}

export interface CreateTurnData {
  name: string
  crop: string
  threshold_mm: number
  controller_id: string
}

export interface UpdateTurnData {
  name?: string
  status?: 'active' | 'paused'
  threshold_mm?: number
}

export interface Controller {
  id: string
  name: string
  sync_status: 'synced' | 'pending' | 'error'
  override_mode: 'none' | 'temporary_24h' | 'temporary_48h' | 'permanent'
  last_heartbeat_at: string | null
}

export interface Fogger {
  id: string
  name: string
  behavior_config: Record<string, unknown>
  status: 'active' | 'idle' | 'error'
}

export interface FoggerPreset {
  id: string
  name: string
  config: Record<string, unknown>
}

export async function getIrrigationTurns(): Promise<IrrigationTurn[]> {
  const { data } = await api.get<IrrigationTurn[]>('/dashboard/irrigation/turns')
  return data
}

export async function getTurnHistory(turnId: string): Promise<TurnHistoryEntry[]> {
  const { data } = await api.get<TurnHistoryEntry[]>(`/dashboard/irrigation/turns/${turnId}/history`)
  return data
}

export async function createTurn(payload: CreateTurnData): Promise<IrrigationTurn> {
  const { data } = await api.post<IrrigationTurn>('/dashboard/irrigation/turns', payload)
  return data
}

export async function updateTurn(turnId: string, payload: UpdateTurnData): Promise<IrrigationTurn> {
  const { data } = await api.patch<IrrigationTurn>(`/dashboard/irrigation/turns/${turnId}`, payload)
  return data
}

export async function getControllers(): Promise<Controller[]> {
  const { data } = await api.get<Controller[]>('/dashboard/controllers')
  return data
}

export async function updateControllerOverride(
  controllerId: string,
  override_mode: Controller['override_mode']
): Promise<Controller> {
  const { data } = await api.patch<Controller>(`/dashboard/controllers/${controllerId}`, { override_mode })
  return data
}

export async function getFoggers(): Promise<Fogger[]> {
  const { data } = await api.get<Fogger[]>('/dashboard/foggers')
  return data
}

export async function getFoggerPresets(): Promise<FoggerPreset[]> {
  const { data } = await api.get<FoggerPreset[]>('/dashboard/foggers/presets')
  return data
}
