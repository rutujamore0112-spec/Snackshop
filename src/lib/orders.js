import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { transitionOrder } from './orderLifecycle.mjs'

export function updateOrderStatus(id, status, cancelledBy) {
  return runTransaction(db, tx => transitionOrder(
    tx, doc(db, 'orders', id), productId => doc(db, 'products', productId), status, cancelledBy, serverTimestamp(),
  ))
}
