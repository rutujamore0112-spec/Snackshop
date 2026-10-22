import { collection, query, where } from 'firebase/firestore'

// Physical stock changes on acceptance/payment. Reservations only limit checkout.
export const isSoldOut = product => Number(product.stock || 0) <= 0

export const productAvailability = product => ({
  ...product,
  visibleStock: Math.max(0, (product.stock || 0) - (product.reserved || 0)),
  reservedQty: product.reserved || 0,
})

export const sortProducts = products => [...products].sort((a, b) =>
  (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')
)

export function inventoryQuery(db, { soldOut = false, category = 'all' } = {}) {
  const constraints = [where('stock', soldOut ? '<=' : '>', 0)]
  if (soldOut && category !== 'all') constraints.push(where('category', '==', category))
  return query(collection(db, 'products'), ...constraints)
}
