import { api } from './api'

export interface AlarmRule {
  id: string
  name: string
  metric: string
  operator: 'gt' | 'lt' | 'gte' | 'lte'
  threshold: number
  site_id: string | null
  device_id: string | null
  cooldown_minutes: number
  enabled: boolean
  created_at: string
  updated_at: string
  site_name: string | null
  device_label: string | null
}

export interface AlarmEvent {
  id: string
  rule_name: string
  metric: string
  value: number
  threshold: number
  operator: string
  triggered_at: string
  resolved_at: string | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  device_label: string
  device_uuid: string
  site_name: string | null
}

export interface AlarmEventsResponse {
  events: AlarmEvent[]
  unacked_active: number
}

export interface CreateAlarmRulePayload {
  name: string
  metric: string
  operator: 'gt' | 'lt' | 'gte' | 'lte'
  threshold: number
  device_id?: string | null
  site_id?: string | null
  cooldown_minutes?: number
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export async function getAlarmRules(): Promise<AlarmRule[]> {
  const { data } = await api.get<{ rules: AlarmRule[] }>('/dashboard/alarms/rules')
  return data.rules
}

export async function createAlarmRule(payload: CreateAlarmRulePayload): Promise<AlarmRule> {
  const { data } = await api.post<{ rule: AlarmRule }>('/dashboard/alarms/rules', payload)
  return data.rule
}

export async function updateAlarmRule(id: string, patch: Partial<CreateAlarmRulePayload> & { enabled?: boolean }): Promise<AlarmRule> {
  const { data } = await api.patch<{ rule: AlarmRule }>(`/dashboard/alarms/rules/${id}`, patch)
  return data.rule
}

export async function deleteAlarmRule(id: string): Promise<void> {
  await api.delete(`/dashboard/alarms/rules/${id}`)
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function getAlarmEvents(params?: { active?: boolean; limit?: number }): Promise<AlarmEventsResponse> {
  const { data } = await api.get<AlarmEventsResponse>('/dashboard/alarms/events', {
    params: {
      active: params?.active ? 'true' : undefined,
      limit: params?.limit,
    },
  })
  return data
}

export async function acknowledgeAlarmEvent(id: string): Promise<void> {
  await api.post(`/dashboard/alarms/events/${id}/ack`)
}
