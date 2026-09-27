import crypto from 'node:crypto'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { settleCapturedPayment } from '../../server/settleRazorpay.mjs'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !process.env.FIREBASE_SERVICE_ACCOUNT) {
    return res.status(503).json({ error: 'Webhook is not configured' })
  }
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')
    const supplied = req.headers['x-razorpay-signature']
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/i.test(supplied) || !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))) {
      return res.status(400).json({ error: 'Invalid webhook signature' })
    }
    const payload = JSON.parse(body.toString('utf8'))
    if (payload.event !== 'payment.captured') return res.status(200).json({ received: true })
    const payment = payload.payload?.payment?.entity
    if (!payment?.id || !payment.order_id || payment.status !== 'captured') return res.status(400).json({ error: 'Invalid payment data' })
    const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
    const db = getFirestore(app)
    const orders = await db.collection('orders').where('razorpayOrderId', '==', payment.order_id).limit(1).get()
    if (orders.empty) return res.status(404).json({ error: 'Order not found' })
    const result = await settleCapturedPayment(db, orders.docs[0].ref, payment)
    return res.status(200).json({ received: true, ...result })
  } catch (error) {
    console.error('Razorpay webhook failed:', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}
