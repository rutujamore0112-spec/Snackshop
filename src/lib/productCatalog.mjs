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

export function inventoryQuery(db, { soldOut = false } = {}) {
  // Load the full catalog only when the customer opens the sold-out section.
  // Filter zero-stock products locally so the section does not depend on a
  // separate range query or a category/stock composite index.
  return soldOut
    ? query(collection(db, 'products'))
    : query(collection(db, 'products'), where('stock', '>', 0))
}
