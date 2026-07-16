import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSiteContext } from '../../hooks/useSiteContext'
import {
  getOrders,
  getCustomers,
  createOrder,
  createCustomer,
  type NurseryOrderSummary,
  type OrderStatus,
  type NurseryCustomer,
} from '../../services/nurseryService'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, { bg: string; border: string; text: string; label: string }> = {
  quoted:            { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Cotizado'         },
  confirmed:         { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', label: 'Confirmado'       },
  in_production:     { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', label: 'En producción'    },
  partial_delivered: { bg: '#faf5ff', border: '#c4b5fd', text: '#6d28d9', label: 'Entrega parcial'  },
  completed:         { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Completado'       },
  cancelled:         { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', label: 'Cancelado'        },
}

const TRAY_SIZES = [72, 128, 162, 228] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 13, fontWeight: 600, color: 'var(--p-text-secondary)',
}
const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 7, border: '1px solid var(--p-border)',
  fontSize: 14, color: 'var(--p-text)', background: 'var(--p-bg)', outline: 'none',
}
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, border: 'none',
  background: 'var(--p-primary)', color: '#fff', fontSize: 14,
  fontWeight: 600, cursor: 'pointer',
}
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8,
  border: '1px solid var(--p-border)', background: 'var(--p-bg)',
  color: 'var(--p-text-secondary)', fontSize: 14, cursor: 'pointer',
}

// ── Create customer inline form ────────────────────────────────────────────────

function CreateCustomerInline({ onCreated }: { onCreated: (c: NurseryCustomer) => void }) {
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) { setError('Nombre requerido'); return }
    setSaving(true)
    setError(null)
    try {
      const c = await createCustomer({ name: name.trim(), phone: phone.trim() || undefined })
      onCreated(c)
    } catch {
      setError('No se pudo crear el cliente')
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, border: '1px solid var(--p-border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--p-text-secondary)', marginBottom: 10 }}>
        Nuevo cliente
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Nombre *" style={{ ...inputStyle, fontSize: 13 }} autoFocus />
        <input value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="Teléfono" style={{ ...inputStyle, fontSize: 13 }} />
        {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}
        <button onClick={handleCreate} disabled={saving} style={{ ...primaryBtnStyle, fontSize: 13, padding: '6px 14px', alignSelf: 'flex-end' }}>
          {saving ? 'Guardando...' : 'Crear cliente'}
        </button>
      </div>
    </div>
  )
}

// ── Create order modal ─────────────────────────────────────────────────────────

function CreateOrderModal({ siteId, onClose, onCreated }: {
  siteId:    string
  onClose:   () => void
  onCreated: () => void
}) {
  const [customerId,       setCustomerId]       = useState('')
  const [deliveryDate,     setDeliveryDate]     = useState('')
  const [internalNotes,    setInternalNotes]    = useState('')
  const [showNewCustomer,  setShowNewCustomer]  = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  const { data: customers = [] } = useQuery({
    queryKey: ['nursery-customers'],
    queryFn:  getCustomers,
  })

  function handleNewCustomerCreated(c: NurseryCustomer) {
    setCustomerId(c.id)
    setShowNewCustomer(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createOrder({
        site_id:                  siteId,
        customer_id:              customerId || undefined,
        tentative_delivery_date:  deliveryDate || undefined,
        internal_notes:           internalNotes.trim() || undefined,
      })
      onCreated()
    } catch {
      setError('No se pudo crear el pedido')
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--p-surface)', borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Nuevo pedido</h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Customer selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>
              Cliente
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={inputStyle}>
                <option value="">Sin cliente asignado</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                ))}
              </select>
            </label>
            {!showNewCustomer && (
              <button type="button" onClick={() => setShowNewCustomer(true)}
                style={{ fontSize: 12, color: 'var(--p-primary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                + Crear nuevo cliente
              </button>
            )}
            {showNewCustomer && (
              <CreateCustomerInline onCreated={handleNewCustomerCreated} />
            )}
          </div>

          <label style={labelStyle}>
            Fecha tentativa de entrega
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Notas internas
            <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
              rows={2} style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Comentarios internos sobre el pedido..." />
          </label>

          {error && (
            <div style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={secondaryBtnStyle}>Cancelar</button>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>
              {saving ? 'Guardando...' : 'Crear pedido'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: NurseryOrderSummary }) {
  const cfg     = STATUS_CONFIG[order.status]
  const days    = daysUntil(order.tentative_delivery_date)
  const overdue = days !== null && days < 0 && order.status !== 'completed' && order.status !== 'cancelled'

  return (
    <div style={{
      background: 'var(--p-surface)',
      border: `1.5px solid ${order.status === 'in_production' ? cfg.border : 'var(--p-border)'}`,
      borderRadius: 12, padding: 0, cursor: 'pointer',
      transition: 'box-shadow 0.15s',
      display: 'flex', flexDirection: 'column',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--p-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--p-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {order.customer_name ?? 'Sin cliente'}
            </div>
            {order.customer_phone && (
              <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginTop: 1 }}>{order.customer_phone}</div>
            )}
          </div>
          {/* Status badge */}
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 700,
            padding: '3px 9px', borderRadius: 20,
            background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
          }}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Batches / crops */}
        {(order.batch_count ?? 0) > 0 ? (
          <div style={{ fontSize: 12, color: 'var(--p-text-secondary)' }}>
            <span style={{ fontWeight: 600 }}>{order.batch_count}</span>
            {order.batch_count === 1 ? ' cultivo' : ' cultivos'}&nbsp;·&nbsp;
            <span style={{ fontWeight: 600 }}>{order.total_trays_planned ?? '—'}</span> bandejas planificadas
            {order.total_trays_sown != null && order.total_trays_sown !== order.total_trays_planned && (
              <span style={{ color: 'var(--p-text-muted)' }}> ({order.total_trays_sown} sembradas)</span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--p-text-muted)' }}>Sin cultivos cargados</div>
        )}

        {/* Delivery date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--p-text-muted)' }}>Entrega:</span>
          <span style={{ fontWeight: 600, color: overdue ? '#b91c1c' : 'var(--p-text)' }}>
            {formatDate(order.tentative_delivery_date)}
          </span>
          {days !== null && order.status !== 'completed' && order.status !== 'cancelled' && (
            <span style={{
              fontSize: 11, padding: '1px 7px', borderRadius: 10,
              background: overdue ? '#fef2f2' : days <= 7 ? '#fffbeb' : '#f0fdf4',
              color:      overdue ? '#b91c1c' : days <= 7 ? '#92400e' : '#15803d',
            }}>
              {overdue ? `${Math.abs(days)}d vencido` : days === 0 ? 'hoy' : `${days}d`}
            </span>
          )}
        </div>

        {/* Order date */}
        <div style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>
          Pedido: {formatDate(order.order_date)}
        </div>
      </div>
    </div>
  )
}

// ── Module ────────────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: { value: OrderStatus | ''; label: string }[] = [
  { value: '',                 label: 'Todos'            },
  { value: 'quoted',           label: 'Cotizados'        },
  { value: 'confirmed',        label: 'Confirmados'      },
  { value: 'in_production',    label: 'En producción'    },
  { value: 'partial_delivered', label: 'Entrega parcial' },
  { value: 'completed',        label: 'Completados'      },
  { value: 'cancelled',        label: 'Cancelados'       },
]

export default function NurseryModule() {
  const { siteId }    = useSiteContext()
  const queryClient   = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('in_production')
  const [showCreate,   setShowCreate]   = useState(false)

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ['nursery-orders', siteId, statusFilter],
    queryFn:  () => getOrders({
      site_id: siteId ?? undefined,
      status:  statusFilter || undefined,
    }),
    enabled: !!siteId,
  })

  if (!siteId) {
    return (
      <div style={{ padding: 32, color: 'var(--p-text-secondary)' }}>
        Sin site seleccionado. <a href="/select-site" style={{ color: 'var(--p-primary)' }}>Seleccionar site</a>
      </div>
    )
  }

  // Count by status for summary badges
  const countByStatus = orders.reduce<Partial<Record<OrderStatus, number>>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const activeStatuses: OrderStatus[] = ['confirmed', 'in_production', 'partial_delivered']

  return (
    <div style={{ padding: '20px 20px 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--p-text)', flex: 1 }}>
          Plantinera
        </h2>

        {/* Active order summary badges */}
        {orders.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {activeStatuses.map(s => {
              const count = countByStatus[s] ?? 0
              if (!count) return null
              const cfg = STATUS_CONFIG[s]
              return (
                <span key={s} style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '3px 10px', borderRadius: 20,
                  background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
                }}>
                  {count} {cfg.label.toLowerCase()}
                </span>
              )
            })}
          </div>
        )}

        <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>
          + Nuevo pedido
        </button>
      </div>

      {/* Filters bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            style={{
              fontSize: 13, padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${statusFilter === opt.value ? 'var(--p-primary)' : 'var(--p-border)'}`,
              background: statusFilter === opt.value ? 'var(--p-primary)' : 'var(--p-bg)',
              color: statusFilter === opt.value ? '#fff' : 'var(--p-text-secondary)',
              fontWeight: statusFilter === opt.value ? 600 : 400,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isError && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          Error al cargar los pedidos.
        </div>
      )}

      {isLoading && (
        <div style={{ color: 'var(--p-text-muted)', padding: 40, textAlign: 'center' }}>
          Cargando pedidos...
        </div>
      )}

      {!isLoading && orders.length === 0 && (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: 'var(--p-surface)', borderRadius: 12, border: '1px solid var(--p-border)',
        }}>
          <div style={{ fontSize: 15, color: 'var(--p-text-secondary)', marginBottom: 12 }}>
            {statusFilter
              ? `No hay pedidos con estado "${STATUS_CONFIG[statusFilter as OrderStatus]?.label ?? statusFilter}".`
              : 'No hay pedidos cargados para este site.'}
          </div>
          <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>
            Crear el primer pedido
          </button>
        </div>
      )}

      {/* Orders grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16,
      }}>
        {orders.map(order => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>

      {showCreate && (
        <CreateOrderModal
          siteId={siteId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['nursery-orders'] })
            queryClient.invalidateQueries({ queryKey: ['nursery-customers'] })
          }}
        />
      )}
    </div>
  )
}

// Re-export tray sizes constant for use in other nursery components
export { TRAY_SIZES }
