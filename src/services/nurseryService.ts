import { api } from './api'

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'quoted' | 'confirmed' | 'in_production'
  | 'partial_delivered' | 'completed' | 'cancelled'

export type BatchStatus =
  | 'ordered' | 'sowing' | 'germination'
  | 'grafting_chamber' | 'nursery' | 'delivered'
  | 'cancelled' | 'consumed'

export type TraySize = 72 | 128 | 162 | 228

export type EventType =
  | 'irrigation' | 'fertilization' | 'application'
  | 'observation' | 'photo' | 'treatment' | 'note' | 'bulk_elimination'

export interface NurseryCustomerLocation {
  id:               string
  name:             string
  contact_name:     string | null
  phone:            string | null
  delivery_address: string | null
  active:           boolean
}

export interface NurseryCustomer {
  id:                 string
  name:               string
  parent_customer_id: string | null
  contact_name:       string | null
  email:              string | null
  phone:              string | null
  tax_id_type:        string | null
  tax_id:             string | null
  fiscal_condition:   string | null
  delivery_address:   string | null
  active:             boolean
  created_at:         string
  // Only present on top-level customers (producers)
  locations?:         NurseryCustomerLocation[]
}

export interface CustomerConflict {
  conflict: true
  field:    'name' | 'phone' | 'tax_id'
  existing: { id: string; name: string; phone: string | null; tax_id: string | null }
}

export interface NurseryOrderSummary {
  id:                      string
  order_date:              string
  tentative_delivery_date: string | null
  status:                  OrderStatus
  internal_notes:          string | null
  created_at:              string
  updated_at:              string
  // Customer (may be null if no customer assigned)
  customer_id:             string | null
  customer_name:           string | null
  customer_phone:          string | null
  // Batch aggregates
  batch_count:             number
  total_seeds_planned:     number | null
  total_trays_planned:     number | null
  total_trays_sown:        number | null
  batch_statuses:          BatchStatus[] | null
}

export interface NurseryBatchSummary {
  id:                   string
  batch_type:           'standard' | 'grafted'
  crop:                 string
  hybrid_variety:       string
  tray_size:            TraySize
  total_seeds_planned:  number | null
  total_trays_planned:  number | null
  total_seeds_sown:     number | null
  total_trays_sown:     number | null
  status:               BatchStatus
  sowing_date:          string | null
  unit_price:           number | null
  currency:             string
  created_at:           string
  active_trays:         number
}

export interface NurseryOrderDetail extends NurseryOrderSummary {
  customer_contact:  string | null
  customer_email:    string | null
  tax_id_type:       string | null
  tax_id:            string | null
  fiscal_condition:  string | null
  billing_address:   string | null
  delivery_address:  string | null
  customer_notes:    string | null
}

export interface NurseryTray {
  id:                         string
  tray_number:                number
  qr_code:                    string
  plant_capacity:             number
  status:                     BatchStatus
  is_eliminated:              boolean
  elimination_approval_status: 'pending' | 'approved' | 'rejected' | null
  nursery_placed_at:          string | null
  germination_entry_at:       string | null
  germination_exit_at:        string | null
  delivered_at:               string | null
  greenhouse:                 string | null
  bench:                      string | null
  subbench:                   string | null
}

export interface CreateCustomerPayload {
  name:               string
  parent_customer_id?: string
  contact_name?:      string
  email?:             string
  phone?:             string
  tax_id_type?:       'cuit' | 'cuil' | 'dni' | 'passport' | 'other'
  tax_id?:            string
  fiscal_condition?:  string
  delivery_address?:  string
  force?:             boolean
}

export interface CreateOrderPayload {
  site_id:                  string
  customer_id?:             string
  order_date?:              string
  tentative_delivery_date?: string
  internal_notes?:          string
  customer_notes?:          string
}

export interface CreateBatchPayload {
  crop:                 string
  hybrid_variety:       string
  seed_lot_number?:     string
  purchase_date?:       string
  tray_size:            TraySize
  substrate?:           string
  total_seeds_planned:  number
  unit_price?:          number
  currency?:            'ARS' | 'USD'
  notes?:               string
}

export interface ConfirmSowingPayload {
  sowing_date:        string
  sowing_node_id?:    string
  total_seeds_sown:   number
  substrate?:         string
  confirmed_partial?: boolean
}

export interface CreateEventPayload {
  event_type:         EventType
  occurred_at?:       string
  reference_node_id?: string
  notes?:             string
  photo_url?:         string
  data?:              Record<string, unknown>
  product_name?:      string
  dose?:              string
  phi_days?:          number
}

// ── API calls ─────────────────────────────────────────────────────────────────

// Customers
export async function getCustomers(): Promise<NurseryCustomer[]> {
  const { data } = await api.get<{ customers: NurseryCustomer[] }>('/dashboard/nursery/customers')
  return data.customers
}

// Returns the created customer, or throws with a CustomerConflict attached to the error
// when a duplicate is detected (HTTP 409). The caller can re-send with force:true to bypass.
export async function createCustomer(
  payload: CreateCustomerPayload,
): Promise<NurseryCustomer> {
  try {
    const { data } = await api.post<{ customer: NurseryCustomer }>('/dashboard/nursery/customers', payload)
    return data.customer
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'response' in err &&
      (err as { response?: { status?: number; data?: unknown } }).response?.status === 409
    ) {
      const conflict = (err as { response: { data: CustomerConflict } }).response.data
      const conflictError = new Error('duplicate_customer') as Error & { conflict: CustomerConflict }
      conflictError.conflict = conflict
      throw conflictError
    }
    throw err
  }
}

export interface PatchCustomerPayload {
  name?:               string
  parent_customer_id?: string | null
  contact_name?:       string | null
  email?:              string | null
  phone?:              string | null
  tax_id_type?:        'cuit' | 'cuil' | 'dni' | 'passport' | 'other' | null
  tax_id?:             string | null
  fiscal_condition?:   string | null
  billing_address?:    string | null
  delivery_address?:   string | null
  notes?:              string | null
  active?:             boolean
}

export async function updateCustomer(customerId: string, payload: PatchCustomerPayload): Promise<NurseryCustomer> {
  const { data } = await api.patch<{ customer: NurseryCustomer }>(`/dashboard/nursery/customers/${customerId}`, payload)
  return data.customer
}

// Orders
export async function getOrders(params?: {
  status?:      OrderStatus
  customer_id?: string
  site_id?:     string
  date_from?:   string
  date_to?:     string
}): Promise<NurseryOrderSummary[]> {
  const { data } = await api.get<{ orders: NurseryOrderSummary[] }>(
    '/dashboard/nursery/orders',
    { params },
  )
  return data.orders
}

export async function createOrder(payload: CreateOrderPayload): Promise<{ id: string }> {
  const { data } = await api.post<{ order: { id: string } }>('/dashboard/nursery/orders', payload)
  return data.order
}

export async function getOrderDetail(orderId: string): Promise<{
  order:   NurseryOrderDetail
  batches: NurseryBatchSummary[]
}> {
  const { data } = await api.get<{ order: NurseryOrderDetail; batches: NurseryBatchSummary[] }>(
    `/dashboard/nursery/orders/${orderId}`,
  )
  return data
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, internal_notes?: string): Promise<void> {
  await api.patch(`/dashboard/nursery/orders/${orderId}/status`, { status, internal_notes })
}

// Batches
export async function createBatch(orderId: string, payload: CreateBatchPayload): Promise<{ id: string }> {
  const { data } = await api.post<{ batch: { id: string } }>(
    `/dashboard/nursery/orders/${orderId}/batches`,
    payload,
  )
  return data.batch
}

export async function getBatchDetail(batchId: string): Promise<{
  batch:         Record<string, unknown>
  trays:         { active: NurseryTray[]; eliminated: NurseryTray[]; total: number }
  recent_events: Record<string, unknown>[]
}> {
  const { data } = await api.get(`/dashboard/nursery/batches/${batchId}`)
  return data as {
    batch:         Record<string, unknown>
    trays:         { active: NurseryTray[]; eliminated: NurseryTray[]; total: number }
    recent_events: Record<string, unknown>[]
  }
}

export async function confirmSowing(
  batchId: string,
  payload: ConfirmSowingPayload,
): Promise<{ warning?: boolean; message?: string; empty_cells?: number; trays?: NurseryTray[] }> {
  const { data } = await api.post(`/dashboard/nursery/batches/${batchId}/confirm-sowing`, payload)
  return data as { warning?: boolean; message?: string; empty_cells?: number; trays?: NurseryTray[] }
}

export async function transitionBatch(
  batchId: string,
  to_status: BatchStatus,
  node_id?: string,
): Promise<void> {
  await api.post(`/dashboard/nursery/batches/${batchId}/transition`, { to_status, node_id })
}

export function getQrSheetUrl(batchId: string): string {
  return `/dashboard/nursery/batches/${batchId}/qr-sheet`
}

export async function createBatchEvent(batchId: string, payload: CreateEventPayload): Promise<void> {
  await api.post(`/dashboard/nursery/batches/${batchId}/events`, payload)
}

// Trays
export async function getTrayByQr(qrCode: string): Promise<Record<string, unknown>> {
  const { data } = await api.get(`/dashboard/nursery/trays/by-qr/${qrCode}`)
  return data as Record<string, unknown>
}

export async function addPlantCount(
  trayId: string,
  payload: { count_date?: string; emerged_plants: number; notes?: string },
): Promise<void> {
  await api.post(`/dashboard/nursery/trays/${trayId}/counts`, payload)
}

export async function getPendingEliminations(): Promise<Record<string, unknown>[]> {
  const { data } = await api.get<{ pending: Record<string, unknown>[] }>('/dashboard/nursery/pending-eliminations')
  return data.pending
}
