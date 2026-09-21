import crypto from 'node:crypto'

const MAX_ORDER_PAISE = 5_000_000

export function assertLocalTestConfig(env) {
  if (env.RAZORPAY_LOCAL_ENABLED !== 'true') {
    throw new Error('Local Razorpay checkout is disabled')
  }
  if (!env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('Add Razorpay test-mode credentials to .env.local')
  }
}

export async function createLocalRazorpayOrder(env, payload, fetchImpl = fetch) {
  assertLocalTestConfig(env)
  const amount = Math.round(Number(payload?.amount))
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_ORDER_PAISE) {
    throw new Error('Invalid Razorpay order amount')
  }

  const receipt = String(payload?.receipt || `local_${Date.now()}`).slice(0, 40)
  const authorization = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const response = await fetchImpl('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, currency: 'INR', receipt }),
  })
  const result = await response.json()
  if (!response.ok || !result?.id) {
    throw new Error(result?.error?.description || 'Razorpay could not create a test order')
  }
  return { keyId: env.RAZORPAY_KEY_ID, orderId: result.id, amount, currency: 'INR' }
}

export function verifyLocalRazorpayPayment(env, payload) {
  assertLocalTestConfig(env)
  const orderId = String(payload?.razorpayOrderId || '')
  const paymentId = String(payload?.razorpayPaymentId || '')
  const signature = String(payload?.razorpaySignature || '')
  if (!orderId || !paymentId || !signature) throw new Error('Missing Razorpay verification details')

  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error('Invalid Razorpay payment signature')
  }
  return { verified: true }
}
