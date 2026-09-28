import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { bearerToken, firebaseAdminApp } from '../../server/firebaseAdmin.mjs'
import { prepareCashOrder } from '../../server/cashOrder.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const token = bearerToken(req)
  if (!token) return res.status(401).json({ error: 'Sign in before placing an order' })

  const items = req.body?.items
  const expectedTotalPaise = req.body?.expectedTotalPaise
  if (!Array.isArray(items) || items.length < 1 || items.length > 50 || items.some(item =>
    typeof item?.productId !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(item.productId)
    || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 50
  ) || new Set(items.map(item => item.productId)).size !== items.length
    || !Number.isSafeInteger(expectedTotalPaise) || expectedTotalPaise < 100) {
    return res.status(400).json({ error: 'Invalid cart items' })
  }

  try {
    const app = firebaseAdminApp()
    const user = await getAuth(app).verifyIdToken(token)
    const db = getFirestore(app)
    const orderRef = db.collection('orders').doc()
    const productRefs = items.map(item => db.collection('products').doc(item.productId))
    const name = (typeof user.name === 'string' && user.name.trim().slice(0, 100))
      || user.email?.split('@')[0]?.slice(0, 100) || 'Customer'

    const totalPaise = await db.runTransaction(async transaction => {
      const products = await transaction.getAll(...productRefs)
      const { totalPaise, orderItems, reservations } = prepareCashOrder(items, products, expectedTotalPaise)

      products.forEach((product, i) => {
        transaction.update(productRefs[i], { reserved: reservations[i] })
      })
      transaction.create(orderRef, {
        customerName: name,
        userId: user.uid,
        items: orderItems,
        total: totalPaise / 100,
        status: 'pending',
        reservationActive: true,
        paymentMethod: 'cash',
        createdAt: FieldValue.serverTimestamp(),
      })
      return totalPaise
    })
    return res.status(200).json({ id: orderRef.id, total: totalPaise / 100, name })
  } catch (error) {
    console.error('Cash order creation failed:', error)
    if (error.code?.startsWith('auth/')) return res.status(401).json({ error: 'Authentication failed' })
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Could not place cash order' })
  }
}
