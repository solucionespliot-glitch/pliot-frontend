import { api } from './api'

export interface Annotation {
  id: string
  timestamp: string
  title: string
  description: string
  color?: string
}

export interface CreateAnnotationData {
  timestamp: string
  title: string
  description: string
  color?: string
}

export async function getAnnotations(deviceId: string): Promise<Annotation[]> {
  const { data } = await api.get<Annotation[]>(`/dashboard/devices/${deviceId}/annotations`)
  return data
}

export async function createAnnotation(
  deviceId: string,
  payload: CreateAnnotationData
): Promise<Annotation> {
  const { data } = await api.post<Annotation>(`/dashboard/devices/${deviceId}/annotations`, payload)
  return data
}
