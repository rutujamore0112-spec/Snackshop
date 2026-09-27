import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { settleCapturedPayment } from '../../server/settleRazorpay.mjs'

function sameSignature(expected, supplied) {
  if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/i.test(supplied)) return false
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { firestoreOrderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body || {}
  if (![firestoreOrderId, razorpayPaymentId, razorpayOrderId, razorpaySignature].every(value => typeof value === 'string' && value.length > 0)) {
    return res.status(400).json({ error: 'Missing payment verification details' })
  }
  if (!/^[A-Za-z0-9]{1,40}$/.test(firestoreOrderId)) return res.status(400).json({ error: 'Invalid order ID' })
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return res.status(401).json({ error: 'Sign in before verifying payment' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Payment service is not configured' })
  }
  try {
    const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
    const { uid } = await getAuth(app).verifyIdToken(token)
    const db = getFirestore(app)
    const orderRef = db.collection('orders').doc(firestoreOrderId)
    const snapshot = await orderRef.get()
    if (!snapshot.exists) return res.status(404).json({ error: 'Order not found' })
    const order = snapshot.data()
    if (order.userId !== uid) return res.status(403).json({ error: 'Unauthorized' })
    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpayOrderId) return res.status(400).json({ error: 'Razorpay order ID mismatch' })
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(order.razorpayOrderId + '|' + razorpayPaymentId).digest('hex')
    if (!sameSignature(expected, razorpaySignature)) return res.status(400).json({ error: 'Invalid payment signature' })
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
    const payment = await razorpay.payments.fetch(razorpayPaymentId)
    if (payment.status !== 'captured' || payment.order_id !== order.razorpayOrderId || payment.currency !== 'INR' || Number(payment.amount) !== Number(order.razorpayAmount)) {
      return res.status(400).json({ error: 'Payment is not captured for this order and amount' })
    }
    const result = await settleCapturedPayment(db, orderRef, payment)
    return res.status(200).json({ success: true, ...result })
  } catch (error) {
    console.error('Razorpay verification failed:', error)
    if (error.code?.startsWith('auth/')) return res.status(401).json({ error: 'Authentication failed' })
    return res.status(500).json({ error: 'Could not confirm payment. Please contact the shop with your payment ID.' })
  }
}
