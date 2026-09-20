export const ACTIVE_ORDER_STATUSES = ['draft', 'pending', 'utr_submitted']
export const DRAFT_TIMEOUT_MS = 2 * 60 * 1000

function timestampMillis(value) {
  if (typeof value === 'number') return value
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  return null
}

export function isExpiredDraft(order, now = Date.now()) {
  if (order?.status !== 'draft') return false
  const explicitExpiry = timestampMillis(order.expiresAt)
  const createdAt = timestampMillis(order.createdAt)
  const expiry = explicitExpiry ?? (createdAt == null ? null : createdAt + DRAFT_TIMEOUT_MS)
  return expiry != null && expiry <= now
}

// Read the current order inside the transaction so competing actions cannot
// release a reservation twice or revive an already cancelled order.
export async function transitionOrder(tx, orderRef, productRef, status, cancelledBy) {
  const snapshot = await tx.get(orderRef)
  if (!snapshot.exists()) throw new Error('Order no longer exists')
  const order = snapshot.data()
  if (order.status === status) return
  if (status === 'expire' && order.status !== 'draft') return 'unchanged'
  const active = ACTIVE_ORDER_STATUSES.includes(order.status)
  if (status !== 'delete' && status !== 'expire' && !active) throw new Error(`Order is already ${order.status}`)

  const holdsReservation = active && order.reservationActive !== false
  const quantities = new Map()
  for (const item of order.items || []) {
    if (!item.productId) continue
    if (!Number.isInteger(item.qty) || item.qty <= 0) throw new Error('Invalid order quantity')
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.qty)
  }
  const readProducts = () => Promise.all([...quantities].map(async ([id, qty]) => {
    const ref = productRef(id)
    return { ref, qty, snapshot: await tx.get(ref) }
  }))

  if (status === 'utr_submitted') {
    if (order.paymentMethod !== 'upi') throw new Error('This is not a UPI order')
    if (isExpiredDraft(order)) {
      const products = holdsReservation ? await readProducts() : []
      for (const { ref, qty, snapshot: product } of products) {
        if (product.exists()) tx.update(ref, { reserved: Math.max(0, (product.data().reserved || 0) - qty) })
      }
      tx.update(orderRef, { status: 'cancelled', cancelledBy: 'timeout', reservationActive: false })
      return 'expired'
    }
    if (!holdsReservation) {
      const products = await readProducts()
      for (const { ref, qty, snapshot: product } of products) {
        if (!product.exists()) throw new Error('An item is no longer available')
        const data = product.data()
        const available = (data.stock || 0) - (data.reserved || 0)
        if (available < qty) throw new Error(available <= 0 ? 'An item just sold out' : `Only ${available} left for an item`)
      }
      for (const { ref, qty, snapshot: product } of products) {
        tx.update(ref, { reserved: (product.data().reserved || 0) + qty })
      }
    }
    tx.update(orderRef, { status, reservationActive: true })
    return status
  }
  if (status === 'paid' && order.status === 'draft') {
    throw new Error('Customer has not submitted payment yet')
  }
  if (status === 'expire' && !isExpiredDraft(order)) return 'unchanged'
  if (!['paid', 'cancelled', 'delete', 'expire'].includes(status)) throw new Error('Invalid order action')

  if (holdsReservation) {
    const products = await readProducts()
    for (const { ref, qty, snapshot: product } of products) {
      if (!product.exists()) continue
      const data = product.data()
      if (status === 'paid' && (data.stock || 0) < qty) throw new Error('Insufficient stock to confirm order')
      const updates = { reserved: Math.max(0, (data.reserved || 0) - qty) }
      if (status === 'paid') updates.stock = data.stock - qty
      tx.update(ref, updates)
    }
  }
  if (status === 'delete') tx.delete(orderRef)
  else tx.update(orderRef, {
    status: status === 'expire' ? 'cancelled' : status,
    reservationActive: false,
    ...(status === 'expire' ? { cancelledBy: 'timeout' } : cancelledBy ? { cancelledBy } : {}),
  })
  return status === 'expire' ? 'expired' : status
}
