export const ACTIVE_ORDER_STATUSES = ['draft', 'pending', 'utr_submitted']

// Read the current order inside the transaction so competing actions cannot
// release a reservation twice or revive an already cancelled order.
export async function transitionOrder(tx, orderRef, productRef, status, cancelledBy) {
  const snapshot = await tx.get(orderRef)
  if (!snapshot.exists()) throw new Error('Order no longer exists')
  const order = snapshot.data()
  if (order.status === status) return
  const active = ACTIVE_ORDER_STATUSES.includes(order.status)
  if (status !== 'delete' && !active) throw new Error(`Order is already ${order.status}`)

  if (status === 'utr_submitted') {
    if (order.paymentMethod !== 'upi') throw new Error('This is not a UPI order')
    tx.update(orderRef, { status })
    return
  }
  if (status === 'paid' && order.status === 'draft') {
    throw new Error('Customer has not submitted payment yet')
  }
  if (!['paid', 'cancelled', 'delete'].includes(status)) throw new Error('Invalid order action')

  if (active) {
    const quantities = new Map()
    for (const item of order.items || []) {
      if (!item.productId) continue
      if (!Number.isInteger(item.qty) || item.qty <= 0) throw new Error('Invalid order quantity')
      quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.qty)
    }
    const products = await Promise.all([...quantities].map(async ([id, qty]) => {
      const ref = productRef(id)
      return { ref, qty, snapshot: await tx.get(ref) }
    }))
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
  else tx.update(orderRef, { status, ...(cancelledBy ? { cancelledBy } : {}) })
}
