import { api } from './api'

export interface IrrigationTurn {
  id: string
  name: string
  crop: string
  status: 'active' | 'paused' | 'error' | 'finished'
  etc_accumulated_l: number
  next_irrigation_at: string | null
  kc_stage_active: string
  days_since_sowing: number
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
  device_name: string
  site_id: string
  sync_status: 'synced' | 'pending' | 'error'
  override_mode: 'none' | 'temporary_24h' | 'temporary_48h' | 'permanent'
  last_seen_at: string | null
  online: boolean
  context: Record<string, unknown> | null
}

export type BehaviorType = 'vpd' | 'schedule' | 'irrigation' | 'temperature' | 'manual' | 'blocked_by_program'

export interface InfluenceNode {
  id: string
  device_id: string
}

export interface Actuator {
  id: string
  label: string
  relay_index: number
  enabled: boolean
  behavior_type: BehaviorType
  behavior_config: Record<string, unknown>
  default_safe_state: string
  influence_nodes: InfluenceNode[]
}

export interface Fogger {
  actuator_id: string
  controller_id: string
  device_name: string
  actuator_label: string
  behavior_config: Record<string, unknown>
  online: boolean
  last_seen_at: string | null
}

export interface FoggerPreset {
  id: string
  name: string
  config: Record<string, unknown>
}

export async function getIrrigationTurns(): Promise<IrrigationTurn[]> {
  const { data } = await api.get<{ turns: IrrigationTurn[] }>('/dashboard/irrigation/turns')
  return data.turns
}

export async function getTurnHistory(turnId: string): Promise<TurnHistoryEntry[]> {
  const { data } = await api.get<{ history: TurnHistoryEntry[] }>(`/dashboard/irrigation/turns/${turnId}/history`)
  return data.history
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
  const { data } = await api.get<{ controllers: Controller[] }>('/dashboard/controllers')
  return data.controllers
}

export async function updateControllerOverride(
  controllerId: string,
  override_mode: Controller['override_mode']
): Promise<Controller> {
  const { data } = await api.patch<Controller>(`/dashboard/controllers/${controllerId}/override`, { override_mode })
  return data
}

export async function getFoggers(): Promise<Fogger[]> {
  const { data } = await api.get<{ foggers: Fogger[] }>('/dashboard/foggers')
  return data.foggers
}

export async function getFoggerPresets(): Promise<FoggerPreset[]> {
  const { data } = await api.get<{ presets: FoggerPreset[] }>('/dashboard/foggers/presets')
  return data.presets
}

export async function getControllerActuators(controllerId: string): Promise<Actuator[]> {
  const { data } = await api.get<{ actuators: Actuator[] }>(`/dashboard/controllers/${controllerId}/actuators`)
  return data.actuators
}

export async function updateActuatorBehavior(
  controllerId: string,
  actuatorId: string,
  behavior_type: BehaviorType,
  behavior_config: Record<string, unknown>,
): Promise<Actuator> {
  const { data } = await api.put<{ ok: boolean; actuator: Actuator }>(
    `/dashboard/controllers/${controllerId}/actuators/${actuatorId}`,
    { behavior_type, behavior_config },
  )
  return data.actuator
}

export async function updateActuatorNodes(
  controllerId: string,
  actuatorId: string,
  node_ids: string[],
): Promise<void> {
  await api.put(
    `/dashboard/controllers/${controllerId}/actuators/${actuatorId}/nodes`,
    { node_ids },
  )
}

export async function patchActuatorLabel(
  controllerId: string,
  actuatorId: string,
  label: string,
): Promise<void> {
  await api.patch(
    `/dashboard/controllers/${controllerId}/actuators/${actuatorId}`,
    { label },
  )
}

type ControllerCommand =
  | { command_type: 'pulseRelay';  relay_index: number; duration_minutes: number }
  | { command_type: 'stopRelay';   relay_index: number }
  | { command_type: 'pauseRelay';  relay_index: number }
  | { command_type: 'resumeRelay'; relay_index: number }

export async function sendControllerCommand(
  controllerId: string,
  command: ControllerCommand,
): Promise<void> {
  await api.post(`/dashboard/controllers/${controllerId}/commands`, command)
}

// Controller-level cascade cycle timing — stored in context JSONB and read by the
// firmware from controller.context in the snapshot. Fields are merged (not replaced).
export interface ControllerContextPatch {
  on_seconds?:           number
  off_seconds?:          number
  min_interval_seconds?: number
  relay_mode?:           'cascade' | 'independent'
  cascade_delay_ms?:     number
}

export async function updateControllerContext(
  controllerId: string,
  patch: ControllerContextPatch,
): Promise<void> {
  await api.patch(`/dashboard/controllers/${controllerId}/context`, patch)
}
