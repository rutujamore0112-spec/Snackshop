import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import { transitionOrder } from './orderLifecycle.mjs'

export function updateOrderStatus(id, status, cancelledBy) {
  return runTransaction(db, tx => transitionOrder(
    tx, doc(db, 'orders', id), productId => doc(db, 'products', productId), status, cancelledBy, serverTimestamp(),
  ))
}

export async function cancelCustomerOrder(orderId, reason = 'customer') {
  if (!auth.currentUser) throw new Error('Sign in before cancelling an order')
  const token = await auth.currentUser.getIdToken()
  const response = await fetch('/api/orders/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ orderId, reason }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Could not cancel order')
  return result
}
