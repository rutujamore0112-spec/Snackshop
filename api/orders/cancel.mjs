import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { bearerToken, firebaseAdminApp } from '../../server/firebaseAdmin.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const token = bearerToken(req)
  if (!token) return res.status(401).json({ error: 'Sign in before cancelling an order' })
  const { orderId, reason = 'customer' } = req.body || {}
  if (typeof orderId !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(orderId)
    || !['customer', 'timeout'].includes(reason)) {
    return res.status(400).json({ error: 'Invalid cancellation request' })
  }

  try {
    const app = firebaseAdminApp()
    const { uid } = await getAuth(app).verifyIdToken(token)
    const db = getFirestore(app)
    const orderRef = db.collection('orders').doc(orderId)
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(orderRef)
      if (!snapshot.exists || snapshot.data().userId !== uid) {
        throw Object.assign(new Error('Order not found'), { statusCode: 404 })
      }
      const order = snapshot.data()
      if (order.status === 'cancelled') return
      if (!['draft', 'pending', 'utr_submitted'].includes(order.status) || order.paymentId) {
        throw Object.assign(new Error('This order can no longer be cancelled'), { statusCode: 409 })
      }
      if (reason === 'timeout') {
        const expiry = order.expiresAt?.toMillis?.() ?? order.createdAt?.toMillis?.() + 120000
        if (order.status !== 'draft' || !Number.isFinite(expiry) || expiry > Date.now()) {
          throw Object.assign(new Error('This order has not expired'), { statusCode: 409 })
        }
      }

      const quantities = new Map()
      if (order.reservationActive !== false) {
        for (const item of order.items || []) {
          if (typeof item.productId !== 'string' || !Number.isInteger(item.qty) || item.qty < 1) {
            throw new Error('Invalid reserved order item')
          }
          quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.qty)
        }
      }
      const entries = [...quantities]
      const productRefs = entries.map(([id]) => db.collection('products').doc(id))
      const products = productRefs.length ? await transaction.getAll(...productRefs) : []
      for (let i = 0; i < entries.length; i++) {
        const qty = entries[i][1]
        const ref = productRefs[i]
        const product = products[i]
        if (product.exists) transaction.update(ref, { reserved: Math.max(0, (product.data().reserved || 0) - qty) })
      }
      transaction.update(orderRef, {
        status: 'cancelled',
        reservationActive: false,
        cancelledBy: reason,
        cancelledAt: FieldValue.serverTimestamp(),
      })
    })
    return res.status(200).json({ cancelled: true })
  } catch (error) {
    console.error('Customer order cancellation failed:', error)
    if (error.code?.startsWith('auth/')) return res.status(401).json({ error: 'Authentication failed' })
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Could not cancel order' })
  }
}
